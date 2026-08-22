// Enrich-stage deterministic lookup: queries Overpass API for shelters,
// vets, and boarding facilities near a point. No model calls. Never throws
// — returns [] on total failure so the caller can fall back to seed data.
//
// Endpoint order and timeouts are set from measurement, not guesswork:
// overpass-api.de returns a transient 504 under load but recovers on an
// immediate retry (~6s); overpass.kumi.systems hung for 84s before 502ing.
// So: retry the primary twice before touching a mirror, and keep the
// per-attempt timeout short enough that a stalled mirror can't freeze a demo.

import crypto from 'node:crypto';
import { getCached, setCached } from './cache.js';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass-api.de/api/interpreter', // immediate retry — 504s here are transient
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter', // slowest in testing; last resort
];

const TIMEOUT_MS = 20000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h — OSM data moves slowly
const MILES_TO_METERS = 1609.34;

const KIND_TAG_MAP = {
  animal_shelter: 'amenity=animal_shelter',
  veterinary: 'amenity=veterinary',
  animal_boarding: 'amenity=animal_boarding',
};

export function buildQuery({ lat, lon, radiusMiles, kinds }) {
  const radiusMeters = Math.round(radiusMiles * MILES_TO_METERS);
  const selectedKinds = kinds && kinds.length ? kinds : Object.keys(KIND_TAG_MAP);
  const clauses = selectedKinds
    .filter((k) => KIND_TAG_MAP[k])
    .map((k) => {
      const [key, value] = KIND_TAG_MAP[k].split('=');
      return `  nwr(around:${radiusMeters},${lat},${lon})["${key}"="${value}"];`;
    })
    .join('\n');

  return `[out:json][timeout:60];\n(\n${clauses}\n);\nout center tags;`;
}

async function postToEndpoint(endpoint, query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'dog-agentic-search/0.1 (hackathon project)',
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    return Array.isArray(data.elements) ? data.elements : [];
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchNearby({ lat, lon, radiusMiles, kinds }) {
  const query = buildQuery({ lat, lon, radiusMiles, kinds });
  const cacheKey = 'overpass:' + crypto.createHash('sha256').update(query).digest('hex').slice(0, 32);

  const cached = getCached(cacheKey, CACHE_TTL_MS);
  if (cached) {
    console.log(`[overpass] cache hit (${cached.length} elements)`);
    return cached;
  }

  for (let i = 0; i < ENDPOINTS.length; i++) {
    const endpoint = ENDPOINTS[i];
    const started = Date.now();
    try {
      const elements = await postToEndpoint(endpoint, query);
      const ms = Date.now() - started;
      console.log(`[overpass] ${new URL(endpoint).host} -> ${elements.length} elements in ${ms}ms`);
      if (elements.length) setCached(cacheKey, elements);
      return elements;
    } catch (err) {
      const ms = Date.now() - started;
      const reason = err.name === 'AbortError' ? `timeout after ${TIMEOUT_MS}ms` : err.message;
      console.warn(`[overpass] attempt ${i + 1}/${ENDPOINTS.length} ${new URL(endpoint).host} failed (${reason}, ${ms}ms)`);
    }
  }

  console.error('[overpass] all endpoints failed — caller should fall back to seed data');
  // Empty array, but flagged so the caller can tell a real outage apart from
  // a genuinely empty search area and word its warning honestly.
  const failed = [];
  failed.overpassFailed = true;
  return failed;
}
