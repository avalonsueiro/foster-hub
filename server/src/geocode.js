// Enrich-stage deterministic lookup: turns a free-text location string into
// coordinates via Nominatim. No model calls. Cached, rate-limited to
// Nominatim's 1 req/sec usage policy.

import { getCached, setCached } from './cache.js';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'dog-agentic-search/0.1 (hackathon project)';
const MIN_INTERVAL_MS = 1000;

let lastRequestAt = 0;

async function throttle() {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL_MS - elapsed));
  }
  lastRequestAt = Date.now();
}

export async function geocodeLocation(query) {
  if (!query || typeof query !== 'string' || !query.trim()) {
    throw new Error('geocodeLocation: query must be a non-empty string');
  }

  const normalized = query.trim();
  const cacheKey = `geocode:${normalized.toLowerCase()}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  await throttle();

  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(normalized)}&format=json&limit=1`;

  let res;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
  } catch (err) {
    throw new Error(`geocodeLocation: network error contacting Nominatim: ${err.message}`);
  }

  if (!res.ok) {
    throw new Error(`geocodeLocation: Nominatim returned HTTP ${res.status}`);
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    throw new Error(`geocodeLocation: could not parse Nominatim response: ${err.message}`);
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`geocodeLocation: no results found for "${normalized}"`);
  }

  const first = data[0];
  const result = {
    lat: parseFloat(first.lat),
    lon: parseFloat(first.lon),
    displayName: first.display_name || normalized,
  };

  if (Number.isNaN(result.lat) || Number.isNaN(result.lon)) {
    throw new Error(`geocodeLocation: Nominatim returned invalid coordinates for "${normalized}"`);
  }

  setCached(cacheKey, result);
  return result;
}
