// Seed adapter — reads fabricated dogs from data/seed-dogs.json.
//
// This is the reference implementation. It is fully working, which means the
// /api/animals endpoint returns real payloads with no network at all: useful
// for building against, and it keeps the demo alive when venue wifi dies.
// Every record it returns is flagged isSynthetic so nothing here can be
// mistaken for a live listing.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_DOGS_FILE = path.join(__dirname, '..', '..', 'data', 'seed-dogs.json');

// Cached in-process: the file never changes while the server is up, and the
// fan-out calls this once per organization.
let cache = null;

async function loadAll() {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(SEED_DOGS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    cache = Array.isArray(parsed) ? parsed : [];
  } catch {
    cache = [];
  }
  return cache;
}

async function fetchAnimals(org, { species, limit } = {}) {
  const all = await loadAll();

  let matches = all.filter((animal) => animal.orgId === org.id);
  if (species) {
    matches = matches.filter((animal) => animal.species === species);
  }
  if (Number.isFinite(limit) && limit > 0) {
    matches = matches.slice(0, limit);
  }

  return matches;
}

export default {
  feedType: 'seed',
  implemented: true,
  fetchAnimals,
};
