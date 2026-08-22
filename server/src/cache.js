// Simple JSON-file cache with TTL. Deterministic lookup — part of the
// enrich stage, no model calls here. Never crashes the process; a missing
// or corrupt cache file is treated as an empty cache.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', 'data');
const CACHE_FILE = path.join(CACHE_DIR, 'cache.json');

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function readCacheFile() {
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
}

function writeCacheFile(data) {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch {
    // Best-effort cache; ignore write failures (e.g. read-only fs).
  }
}

export function getCached(key, ttlMs = DEFAULT_TTL_MS) {
  const data = readCacheFile();
  const entry = data[key];
  if (!entry) return null;
  const age = Date.now() - entry.storedAt;
  if (age > ttlMs) return null;
  return entry.value;
}

export function setCached(key, value) {
  const data = readCacheFile();
  data[key] = { storedAt: Date.now(), value };
  writeCacheFile(data);
}
