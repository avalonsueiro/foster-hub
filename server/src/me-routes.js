// Account routes: signup/login/logout plus the signed-in user's data —
// saved dogs, foster journal, to-dos, and the current placement. Everything
// here is plain CRUD against the JSON store; no model calls, no external
// services.
//
// Exported as a factory returning an express.Router so index.js stays the
// single place routes are registered.

import express from 'express';
import {
  createSession,
  destroySession,
  hashPassword,
  publicUser,
  requireAuth,
  verifyPassword,
} from './auth.js';
import { withStore, readStore, newId } from './store.js';

// Journal photos arrive as client-resized data URLs, so this router needs a
// larger body cap than the default. Scoped here, not globally — search
// requests have no business being 8MB.
const JSON_8MB = express.json({ limit: '8mb' });

const MOODS = ['great', 'settling', 'hiccups', 'help'];

const PROFILE_FIELDS = [
  'firstName', 'lastName', 'email', 'zip',
  'homeType', 'household',
  'rentOwn', 'landlordOk', 'outdoorSpace',
  'hasPets', 'petsSpayed', 'petsVaccinated',
  'fosterSizes', 'openTo', 'duration', 'vetTransport',
];

function cleanEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** Copies only the known wizard fields — whatever else is in the body stays out of the store. */
function pickProfile(body) {
  const profile = {};
  for (const field of PROFILE_FIELDS) {
    if (body[field] !== undefined) profile[field] = body[field];
  }
  return profile;
}

export function createMeRouter() {
  const router = express.Router();

  // ── Auth ────────────────────────────────────────────────────────────────

  router.post('/auth/signup', (req, res) => {
    const body = req.body || {};
    const email = cleanEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';
    const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';

    if (!email) return res.status(400).json({ error: 'A valid email is required.' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (!firstName) return res.status(400).json({ error: 'First name is required.' });

    const { salt, hash } = hashPassword(password);

    const result = withStore((data) => {
      if (data.users.some((u) => u.email === email)) {
        return { conflict: true };
      }
      const user = {
        id: newId(),
        email,
        passwordHash: hash,
        salt,
        profile: { ...pickProfile(body), email },
        createdAt: new Date().toISOString(),
      };
      data.users.push(user);
      return { user };
    });

    if (result.conflict) {
      return res.status(409).json({ error: 'An account with that email already exists — try logging in.' });
    }

    const token = createSession(result.user.id);
    res.status(201).json({ token, user: publicUser(result.user) });
  });

  router.post('/auth/login', (req, res) => {
    const body = req.body || {};
    const email = cleanEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';

    const user = email ? readStore().users.find((u) => u.email === email) : null;
    // One error message for both unknown-email and wrong-password: telling a
    // caller which one it was confirms whether an address has an account.
    if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }

    const token = createSession(user.id);
    res.json({ token, user: publicUser(user) });
  });

  router.post('/auth/logout', requireAuth, (req, res) => {
    destroySession(req.token);
    res.json({ ok: true });
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  // ── Saved dogs ──────────────────────────────────────────────────────────
  // Stored as snapshots (name, breed line, photo, shelter, sourceUrl) rather
  // than bare ids: the dashboard must render a saved dog even when the feed
  // that produced it is unreachable — or the dog has since been delisted.

  router.get('/me/saved', requireAuth, (req, res) => {
    res.json({ saved: readStore().saved[req.user.id] ?? [] });
  });

  router.put('/me/saved', requireAuth, (req, res) => {
    const dog = req.body?.dog;
    if (!dog || typeof dog.id !== 'string' || !dog.id) {
      return res.status(400).json({ error: 'A dog snapshot with an id is required.' });
    }
    const snapshot = {
      id: dog.id,
      name: typeof dog.name === 'string' ? dog.name : 'Unnamed',
      breedLine: typeof dog.breedLine === 'string' ? dog.breedLine : null,
      photo: typeof dog.photo === 'string' ? dog.photo : null,
      orgName: typeof dog.orgName === 'string' ? dog.orgName : null,
      sourceUrl: typeof dog.sourceUrl === 'string' ? dog.sourceUrl : null,
      meta: typeof dog.meta === 'string' ? dog.meta : null,
      savedAt: new Date().toISOString(),
    };
    const saved = withStore((data) => {
      const list = data.saved[req.user.id] ?? (data.saved[req.user.id] = []);
      if (!list.some((d) => d.id === snapshot.id)) list.unshift(snapshot);
      return list;
    });
    res.json({ saved });
  });

  router.delete('/me/saved/:dogId', requireAuth, (req, res) => {
    const saved = withStore((data) => {
      data.saved[req.user.id] = (data.saved[req.user.id] ?? []).filter((d) => d.id !== req.params.dogId);
      return data.saved[req.user.id];
    });
    res.json({ saved });
  });

  // ── Foster journal ──────────────────────────────────────────────────────

  router.get('/me/updates', requireAuth, (req, res) => {
    res.json({ updates: readStore().updates[req.user.id] ?? [] });
  });

  router.post('/me/updates', JSON_8MB, requireAuth, (req, res) => {
    const body = req.body || {};
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const mood = MOODS.includes(body.mood) ? body.mood : null;
    if (!text && !mood) {
      return res.status(400).json({ error: 'An update needs a mood, some text, or both.' });
    }

    const photos = Array.isArray(body.photos)
      ? body.photos.filter((p) => typeof p === 'string' && p.startsWith('data:image/')).slice(0, 3)
      : [];

    const entry = {
      id: newId(),
      mood,
      text,
      photos,
      createdAt: new Date().toISOString(),
    };
    const updates = withStore((data) => {
      const list = data.updates[req.user.id] ?? (data.updates[req.user.id] = []);
      list.unshift(entry); // newest first, matching how the dashboard renders
      return list;
    });
    res.status(201).json({ updates });
  });

  // ── To-dos ──────────────────────────────────────────────────────────────

  router.get('/me/todos', requireAuth, (req, res) => {
    res.json({ todos: readStore().todos[req.user.id] ?? [] });
  });

  router.post('/me/todos', requireAuth, (req, res) => {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text) return res.status(400).json({ error: 'To-do text is required.' });
    const todo = { id: newId(), text, done: false, createdAt: new Date().toISOString() };
    const todos = withStore((data) => {
      const list = data.todos[req.user.id] ?? (data.todos[req.user.id] = []);
      list.push(todo);
      return list;
    });
    res.status(201).json({ todos });
  });

  router.patch('/me/todos/:id', requireAuth, (req, res) => {
    const todos = withStore((data) => {
      const list = data.todos[req.user.id] ?? [];
      const todo = list.find((t) => t.id === req.params.id);
      if (todo && typeof req.body?.done === 'boolean') todo.done = req.body.done;
      if (todo && typeof req.body?.text === 'string' && req.body.text.trim()) todo.text = req.body.text.trim();
      return list;
    });
    res.json({ todos });
  });

  router.delete('/me/todos/:id', requireAuth, (req, res) => {
    const todos = withStore((data) => {
      data.todos[req.user.id] = (data.todos[req.user.id] ?? []).filter((t) => t.id !== req.params.id);
      return data.todos[req.user.id];
    });
    res.json({ todos });
  });

  // ── Current placement ("Currently fostering") ──────────────────────────

  router.get('/me/placement', requireAuth, (req, res) => {
    res.json({ placement: readStore().placements[req.user.id] ?? null });
  });

  router.put('/me/placement', requireAuth, (req, res) => {
    const body = req.body || {};
    if (body.placement === null) {
      // Explicit null clears it — the foster went home.
      const placement = withStore((data) => { delete data.placements[req.user.id]; return null; });
      return res.json({ placement });
    }
    const p = body.placement || {};
    const placement = {
      dogName: typeof p.dogName === 'string' ? p.dogName.trim() : '',
      breedLine: typeof p.breedLine === 'string' ? p.breedLine : null,
      photo: typeof p.photo === 'string' ? p.photo : null,
      orgName: typeof p.orgName === 'string' ? p.orgName : null,
      fosterToAdopt: p.fosterToAdopt === true,
      startedAt: typeof p.startedAt === 'string' ? p.startedAt : new Date().toISOString(),
    };
    if (!placement.dogName) return res.status(400).json({ error: 'placement.dogName is required.' });
    withStore((data) => { data.placements[req.user.id] = placement; });
    res.json({ placement });
  });

  return router;
}
