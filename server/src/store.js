// JSON file store for accounts and per-user data (saved dogs, journal,
// to-dos, placement). One file, read on demand, written through on every
// mutation with a write-temp-then-rename so a crash mid-write can't corrupt
// the store. Same fail-soft spirit as cache.js: a missing file is an empty
// store, never a crash.
//
// This is deliberately a demo-grade store — single process, whole-file
// rewrites, no locking. It holds password *hashes*, so the file is
// gitignored; see auth.js for why plaintext never gets near it.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'app-store.json');

const EMPTY = () => ({
  users: [],        // { id, email, passwordHash, salt, profile, createdAt }
  sessions: {},     // token -> { userId, createdAt, expiresAt }
  saved: {},        // userId -> [dog snapshot]
  updates: {},      // userId -> [journal entry]
  todos: {},        // userId -> [todo]
  placements: {},   // userId -> placement | undefined
});

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    // Merge over EMPTY so adding a new top-level collection later doesn't
    // require migrating existing store files.
    return { ...EMPTY(), ...parsed };
  } catch {
    return EMPTY();
  }
}

function persist(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = STORE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, STORE_FILE); // atomic on the same filesystem
}

/** Read-modify-write in one step. `fn` mutates the store and may return a value. */
export function withStore(fn) {
  const data = load();
  const result = fn(data);
  persist(data);
  return result;
}

/** Read-only access — no write-back. */
export function readStore() {
  return load();
}

export function newId() {
  return crypto.randomBytes(8).toString('hex');
}
