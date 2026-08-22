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
import { fetchNonprofitsNear, prewarm } from './nonprofits.js';
import { normalizeElement } from './normalize.js';
import { enrichOrganizations } from './enrich.js';
import { distanceMiles } from './distance.js';
import { createAnimalsHandler } from './animals.js';

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

  // Loose name key so "Muttville" and "Muttville Senior Dog Rescue" collide.
  // Returns '' for records we must never merge (see UNMERGEABLE below).
  function nameKey(org) {
    let n = (org.name || '').toLowerCase();

    // The IRS spells out what everyone else abbreviates. Without this,
    // "San Francisco Society For The Prevention Of Cruelty To Animals" and
    // "San Francisco SPCA" stay separate rows for the same organisation.
    n = n.replace(/society for the prevention of cruelty to animals/g, 'spca');
    n = n.replace(/s\.p\.c\.a\.?/g, 'spca');
    n = n.replace(/humane society/g, 'humane');

    return n
      .replace(/\b(inc|incorporated|the|a|of|and|foundation|rescue|shelter|animal|animals|senior|dog|dogs|cat|cats|center|centre|adoption|campus)\b/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  // An OSM feature with no name tag carries no identity. Two of them are not
  // the same facility just because both normalise to "unnamed" — merging them
  // silently deletes a real location.
  function unmergeable(org) {
    return !org.name || /^unnamed\b/i.test(org.name.trim());
  }

  // An org can appear in BOTH sources: Overpass has the precise building
  // coordinates, the IRS record has EIN and 501(c)(3) status. Neither alone
  // is complete, so merge rather than discard — keep the mapped location,
  // graft on the compliance fields.
  function merge(a, b) {
    const mapped = a.source === 'irs' ? b : a;
    const registry = a.source === 'irs' ? a : b;
    if (mapped === registry) return fieldScore(a) >= fieldScore(b) ? a : b;
    return {
      ...mapped,
      ein: registry.ein ?? mapped.ein ?? null,
      is501c3: registry.is501c3 ?? mapped.is501c3 ?? null,
      haydenTransferRight: registry.haydenTransferRight ?? mapped.haydenTransferRight ?? null,
      complianceSource: registry.complianceSource ?? mapped.complianceSource ?? null,
      complianceVerifiedAt: registry.complianceVerifiedAt ?? mapped.complianceVerifiedAt ?? null,
      source: 'overpass+irs',
    };
  }

  for (const org of orgs) {
    if (unmergeable(org)) { kept.push(org); continue; }
    const key = nameKey(org);
    if (key.length < 3) { kept.push(org); continue; }

    const existingIndex = kept.findIndex((other) => {
      if (unmergeable(other)) return false;
      const otherKey = nameKey(other);
      // Exact match, or one key is a prefix-ish superset of the other. The IRS
      // legal name and the mapped branch name rarely match character for
      // character ("San Francisco SPCA" vs "SF SPCA Pet Adoption Center,
      // Mission Campus"), so require containment plus a meaningful length.
      const related =
        otherKey === key ||
        (key.length >= 8 && otherKey.startsWith(key)) ||
        (otherKey.length >= 8 && key.startsWith(otherKey));
      if (!related) return false;
      // Same name in different sources counts as the same org even when one
      // side only knows the city; require proximity only when both are mapped.
      if (org.source === 'irs' || other.source === 'irs') return true;
      if (org.lat == null || org.lon == null || other.lat == null || other.lon == null) {
        return false;
      }
      return distanceMiles(org.lat, org.lon, other.lat, other.lon) <= 100 / 1609.34;
    });

    if (existingIndex === -1) {
      kept.push(org);
    } else {
      kept[existingIndex] = merge(kept[existingIndex], org);
    }
  }

  return kept;
}

/**
 * Resolves the organizations near a query.
 *
 * Shared by /api/search and /api/animals so the two endpoints can never
 * disagree about what counts as nearby. Returns `{error, status}` rather than
 * throwing or writing a response, leaving each caller to shape its own.
 */
async function resolveOrganizations(body = {}) {
  const warnings = [];

  const location = typeof body.location === 'string' ? body.location.trim() : '';
  const rawLat = Number(body.lat);
  const rawLon = Number(body.lon);
  const hasCoords = Number.isFinite(rawLat) && Number.isFinite(rawLon);

  if (!location && !hasCoords) {
    return { error: 'location or lat/lon is required', status: 400 };
  }

  let radiusMiles = Number(body.radiusMiles);
  if (!Number.isFinite(radiusMiles)) radiusMiles = 10;
  radiusMiles = Math.min(100, Math.max(1, radiusMiles));

  const kinds = Array.isArray(body.kinds) && body.kinds.length
    ? body.kinds.filter((k) => SUPPORTED_KINDS.includes(k))
    : SUPPORTED_KINDS;

  const enrich = Boolean(body.enrich);
  const includeSynthetic = Boolean(body.includeSynthetic);
  // Registry source is on by default: it is the only source that sees
  // foster-based rescues, which Overpass structurally cannot.
  const includeNonprofits = body.includeNonprofits !== false;
  // Opt-in offline mode: serve the seed file and query nothing live. The seed
  // adapter is the only animal feed that works without a network, so this is
  // what makes the pipeline demonstrable when the venue wifi dies.
  const useSeedData = body.useSeedData === true;

  let center;
  let resolvedName;
  if (hasCoords) {
    center = { lat: rawLat, lon: rawLon };
    resolvedName = location || 'Current location';
  } else {
    try {
      const geo = await geocodeLocation(location);
      center = { lat: geo.lat, lon: geo.lon };
      resolvedName = geo.displayName;
    } catch (err) {
      return { error: `Could not resolve location: ${err.message}`, status: 422 };
    }
  }

  let organizations = [];
  let overpassFailed = false;

  // `useSeedData` skips every live source outright rather than letting them
  // fail and fall through. Waiting ~80s for four Overpass endpoints to time
  // out is not "offline support"; asking for seed data should cost nothing.
  if (!useSeedData) {
    // Distinguish "the API failed" from "the API worked and the area is empty".
    // fetchNearby returns [] for both, so record which one actually happened
    // rather than telling the user Overpass was down when it wasn't.
    const elements = await fetchNearby({ ...center, radiusMiles, kinds });
    overpassFailed = elements.overpassFailed === true;
    if (elements.length > 0) {
      organizations = elements
        .map((el) => normalizeElement(el, center))
        .filter((org) => org.lat != null && org.lon != null)
        .filter((org) => org.distanceMiles == null || org.distanceMiles <= radiusMiles);
    }
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
      if (useSeedData) {
        warnings.push('Seed data requested explicitly — no live sources were queried for this response.');
      } else if (overpassFailed) {
        warnings.push('Live map data is unavailable — showing seeded Bay Area data instead.');
      } else if (seedInRadius.length > 0) {
        warnings.push('No live map results in this area — showing seeded Bay Area data instead.');
      } else {
        warnings.push('No shelters, vets, or boarding facilities found within this radius.');
      }
    }
  }

  if (includeNonprofits && !useSeedData) {
    const registry = await fetchNonprofitsNear({ center, radiusMiles });
    if (registry.length) {
      organizations = organizations.concat(registry);
      warnings.push(
        `${registry.length} IRS-registered nonprofits included — located to city level only, not a street address.`,
      );
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

  // Applied unconditionally. Previously this only ran when a strict subset was
  // selected and exempted synthetic records — but the synthetic foster homes
  // are all kind `animal_boarding`, so they surfaced even with Boarding
  // unchecked. A deselected kind should mean deselected.
  if (kinds.length) {
    organizations = organizations.filter((org) => kinds.includes(org.kind));
  }

  if (enrich) {
    organizations = await enrichOrganizations(organizations, { limit: 8 });
  }

  organizations.sort((a, b) => (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity));

  return { location, radiusMiles, kinds, center, resolvedName, organizations, warnings };
}

app.post('/api/search', async (req, res) => {
  const resolved = await resolveOrganizations(req.body || {});
  if (resolved.error) {
    return res.status(resolved.status || 400).json({ error: resolved.error });
  }

  const { location, radiusMiles, center, resolvedName, organizations, warnings } = resolved;

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

app.post('/api/animals', createAnimalsHandler({ resolveOrganizations }));

app.listen(PORT, () => {
  console.log(`dog-agentic-search server listening on port ${PORT}`);
  prewarm('CA'); // fill the registry cache in the background
});
