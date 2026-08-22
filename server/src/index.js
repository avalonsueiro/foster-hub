// Hot path: reason -> propose(-> approve -> act) is not applicable here —
// this is a read-only search endpoint. All heavy lifting (geocoding,
// Overpass fetch, normalization) is deterministic and fast; no LLM call
// anywhere in this server.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';

import { geocodeLocation } from './geocode.js';
import { fetchNearby } from './overpass.js';
import { normalizeElement } from './normalize.js';
import { enrichOrganizations } from './enrich.js';
import { distanceMiles } from './distance.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_FILE = path.join(__dirname, '..', 'data', 'seed-bay-area.json');

const PORT = process.env.PORT || 8787;

const SUPPORTED_KINDS = ['animal_shelter', 'veterinary', 'animal_boarding'];

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/kinds', (_req, res) => {
  res.json(SUPPORTED_KINDS);
});

async function loadSeedData() {
  try {
    const raw = await fs.readFile(SEED_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return null; // signals "unavailable" distinctly from "empty"
  }
}

function withDistance(org, center) {
  if (org.lat == null || org.lon == null) return org;
  const dist = Math.round(distanceMiles(center.lat, center.lon, org.lat, org.lon) * 10) / 10;
  return { ...org, distanceMiles: dist };
}

function dedupe(orgs) {
  const kept = [];

  function fieldScore(org) {
    let score = 0;
    if (org.address?.full) score++;
    if (org.phone) score++;
    if (org.email) score++;
    if (org.website) score++;
    if (org.openingHours) score++;
    if (org.speciesAccepted?.length) score++;
    return score;
  }

  for (const org of orgs) {
    const nameNorm = (org.name || '').trim().toLowerCase();
    const existingIndex = kept.findIndex((other) => {
      const otherNameNorm = (other.name || '').trim().toLowerCase();
      if (otherNameNorm !== nameNorm) return false;
      if (org.lat == null || org.lon == null || other.lat == null || other.lon == null) {
        return false;
      }
      return distanceMiles(org.lat, org.lon, other.lat, other.lon) <= 100 / 1609.34;
    });

    if (existingIndex === -1) {
      kept.push(org);
    } else if (fieldScore(org) > fieldScore(kept[existingIndex])) {
      kept[existingIndex] = org;
    }
  }

  return kept;
}

app.post('/api/search', async (req, res) => {
  const warnings = [];
  const body = req.body || {};

  const location = typeof body.location === 'string' ? body.location.trim() : '';
  if (!location) {
    return res.status(400).json({ error: 'location is required' });
  }

  let radiusMiles = Number(body.radiusMiles);
  if (!Number.isFinite(radiusMiles)) radiusMiles = 30;
  radiusMiles = Math.min(100, Math.max(1, radiusMiles));

  const kinds = Array.isArray(body.kinds) && body.kinds.length
    ? body.kinds.filter((k) => SUPPORTED_KINDS.includes(k))
    : SUPPORTED_KINDS;

  const enrich = Boolean(body.enrich);
  const includeSynthetic = Boolean(body.includeSynthetic);

  let center;
  let resolvedName;
  try {
    const geo = await geocodeLocation(location);
    center = { lat: geo.lat, lon: geo.lon };
    resolvedName = geo.displayName;
  } catch (err) {
    return res.status(422).json({ error: `Could not resolve location: ${err.message}` });
  }

  let organizations = [];

  // Distinguish "the API failed" from "the API worked and the area is empty".
  // fetchNearby returns [] for both, so record which one actually happened
  // rather than telling the user Overpass was down when it wasn't.
  const elements = await fetchNearby({ ...center, radiusMiles, kinds });
  const overpassFailed = elements === null || elements.overpassFailed === true;
  if (elements.length > 0) {
    organizations = elements
      .map((el) => normalizeElement(el, center))
      .filter((org) => org.lat != null && org.lon != null)
      .filter((org) => org.distanceMiles == null || org.distanceMiles <= radiusMiles);
  }

  if (organizations.length === 0) {
    const seed = await loadSeedData();
    if (seed === null) {
      warnings.push(
        overpassFailed
          ? 'Live map data is unavailable and no seed data file was found — returning no results.'
          : 'No facilities found in this area, and no seed data file was found.'
      );
    } else {
      const seedInRadius = seed
        .filter((org) => !org.isSynthetic)
        .map((org) => withDistance(org, center))
        .filter((org) => org.distanceMiles == null || org.distanceMiles <= radiusMiles);
      organizations = seedInRadius;
      if (overpassFailed) {
        warnings.push('Live map data is unavailable — showing seeded Bay Area data instead.');
      } else if (seedInRadius.length > 0) {
        warnings.push('No live map results in this area — showing seeded Bay Area data instead.');
      } else {
        warnings.push('No shelters, vets, or boarding facilities found within this radius.');
      }
    }
  }

  if (includeSynthetic) {
    const seed = await loadSeedData();
    if (seed) {
      const synthetic = seed
        .filter((org) => org.isSynthetic === true)
        .map((org) => withDistance(org, center))
        .filter((org) => org.distanceMiles == null || org.distanceMiles <= radiusMiles);
      if (synthetic.length > 0) {
        organizations = organizations.concat(synthetic);
        warnings.push(
          `Including ${synthetic.length} synthetic demo entries (foster homes) — not real organizations.`,
        );
      }
    }
  }

  organizations = dedupe(organizations);

  if (kinds.length && kinds.length < SUPPORTED_KINDS.length) {
    organizations = organizations.filter(
      (org) => kinds.includes(org.kind) || org.isSynthetic,
    );
  }

  if (enrich) {
    organizations = await enrichOrganizations(organizations, { limit: 8 });
  }

  organizations.sort((a, b) => (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity));

  const byKind = {};
  const bySource = {};
  for (const org of organizations) {
    byKind[org.kind] = (byKind[org.kind] || 0) + 1;
    bySource[org.source] = (bySource[org.source] || 0) + 1;
  }

  res.json({
    query: { location, radiusMiles, center, resolvedName },
    counts: { total: organizations.length, byKind, bySource },
    organizations,
    warnings,
  });
});

app.listen(PORT, () => {
  console.log(`dog-agentic-search server listening on port ${PORT}`);
});
