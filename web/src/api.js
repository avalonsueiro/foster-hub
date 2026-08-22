const DEFAULT_ERROR = 'Something went wrong. Please try again.';

/**
 * Calls POST /api/search with the given params and returns the parsed JSON.
 * Throws an Error with a useful message on non-2xx responses or network failure.
 */
export async function searchOrganizations({
  location,
  lat,
  lon,
  radiusMiles,
  kinds,
  enrich,
  includeSynthetic,
}) {
  let response;
  try {
    response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location,
        lat,
        lon,
        radiusMiles,
        kinds,
        enrich,
        includeSynthetic,
      }),
    });
  } catch {
    throw new Error('Could not connect. Please check your internet connection and try again.');
  }

  let body = null;
  const text = await response.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      // fall through, body stays null
    }
  }

  if (!response.ok) {
    const message = (body && (body.error || body.message)) || 'Search failed. Please try again.';
    throw new Error(message);
  }

  if (!body) {
    throw new Error(DEFAULT_ERROR);
  }

  return body;
}

/**
 * Calls GET /api/health. Returns true if the backend reports healthy,
 * false otherwise (including on network failure). Never throws.
 */
export async function checkHealth() {
  try {
    const response = await fetch('/api/health');
    return response.ok;
  } catch {
    return false;
  }
}

// ─── Foster Fetch: animals + accounts ──────────────────────────────────────

const TOKEN_KEY = 'ff-token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/**
 * Shared request helper. Attaches the Bearer token when present; on a 401
 * clears the stale token so the UI falls back to signed-out state instead of
 * looping on a dead session.
 */
async function request(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Could not connect. Please check your internet connection and try again.');
  }

  let parsed = null;
  const text = await response.text();
  if (text) {
    try { parsed = JSON.parse(text); } catch { /* parsed stays null */ }
  }

  if (response.status === 401 && token) setToken(null);
  if (!response.ok) {
    throw new Error((parsed && (parsed.error || parsed.message)) || DEFAULT_ERROR);
  }
  return parsed ?? {};
}

/** POST /api/animals — dogs near a location, each with a link out to its shelter. */
export function searchAnimals(params) {
  return request('/api/animals', { method: 'POST', body: params });
}

// ─ Auth ─
export async function signup(profileAndPassword) {
  const data = await request('/api/auth/signup', { method: 'POST', body: profileAndPassword });
  setToken(data.token);
  return data.user;
}
export async function login(email, password) {
  const data = await request('/api/auth/login', { method: 'POST', body: { email, password } });
  setToken(data.token);
  return data.user;
}
export async function logout() {
  try { await request('/api/auth/logout', { method: 'POST' }); } finally { setToken(null); }
}
export async function getMe() {
  const data = await request('/api/me');
  return data.user;
}

// ─ Saved dogs ─
export const getSaved = () => request('/api/me/saved').then((d) => d.saved);
export const saveDog = (dog) => request('/api/me/saved', { method: 'PUT', body: { dog } }).then((d) => d.saved);
export const unsaveDog = (dogId) =>
  request(`/api/me/saved/${encodeURIComponent(dogId)}`, { method: 'DELETE' }).then((d) => d.saved);

// ─ Foster journal ─
export const getUpdates = () => request('/api/me/updates').then((d) => d.updates);
export const postUpdate = (entry) => request('/api/me/updates', { method: 'POST', body: entry }).then((d) => d.updates);

// ─ To-dos ─
export const getTodos = () => request('/api/me/todos').then((d) => d.todos);
export const addTodo = (text) => request('/api/me/todos', { method: 'POST', body: { text } }).then((d) => d.todos);
export const patchTodo = (id, patch) =>
  request(`/api/me/todos/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch }).then((d) => d.todos);
export const deleteTodo = (id) =>
  request(`/api/me/todos/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((d) => d.todos);

/**
 * Dogs hearted while signed out live in localStorage under 'ff-saved'.
 * Called right after login/signup: pushes each one to the account, then
 * clears the local list so the heart state has a single source of truth.
 * Failures leave the local list intact — better a duplicate merge attempt
 * next login than silently losing someone's saved dogs.
 */
export async function mergeAnonymousSaves() {
  let anon;
  try { anon = JSON.parse(localStorage.getItem('ff-saved')) ?? []; } catch { anon = []; }
  if (!anon.length) return;
  for (const dog of anon) {
    await saveDog(dog);
  }
  localStorage.removeItem('ff-saved');
}

// ─ Placement ─
export const getPlacement = () => request('/api/me/placement').then((d) => d.placement);
export const setPlacement = (placement) =>
  request('/api/me/placement', { method: 'PUT', body: { placement } }).then((d) => d.placement);
