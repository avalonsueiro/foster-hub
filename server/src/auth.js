// Demo-grade auth: scrypt password hashing (node:crypto, no dependencies)
// and opaque session tokens persisted in the store so `node --watch`
// restarts don't log everyone out.
//
// What "demo-grade" means concretely: passwords are properly salted and
// hashed and compares are constant-time — but there is no email
// verification, no rate limiting, no password reset, and no account
// lockout. Fine for a hackathon demo account; never for a password anyone
// uses elsewhere. The README says the same thing to users.

import crypto from 'node:crypto';
import { withStore, readStore, newId } from './store.js';

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LEN = 64;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEY_LEN, SCRYPT_PARAMS).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, expectedHash) {
  const actual = crypto.scryptSync(password, salt, KEY_LEN, SCRYPT_PARAMS);
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/** Strips credential fields before anything leaves the server. */
export function publicUser(user) {
  const { passwordHash, salt, ...rest } = user;
  return rest;
}

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  withStore((data) => {
    data.sessions[token] = { userId, createdAt: now, expiresAt: now + SESSION_TTL_MS };
    // Opportunistic cleanup so the sessions map doesn't grow forever.
    for (const [t, s] of Object.entries(data.sessions)) {
      if (s.expiresAt < now) delete data.sessions[t];
    }
  });
  return token;
}

export function destroySession(token) {
  withStore((data) => { delete data.sessions[token]; });
}

export function userForToken(token) {
  if (!token) return null;
  const data = readStore();
  const session = data.sessions[token];
  if (!session || session.expiresAt < Date.now()) return null;
  return data.users.find((u) => u.id === session.userId) ?? null;
}

/** Express middleware: 401 unless a valid Bearer token; sets req.user. */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const user = userForToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Not signed in — log in and try again.' });
  }
  req.user = user;
  req.token = token;
  next();
}
