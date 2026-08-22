// Adapter registry: maps a shelter's feed type to the function that fetches
// its adoptable animals.
//
// Every adapter is one async function with the same signature:
//
//     async fetchAnimals(org, { species, limit }) -> RawAnimal[]
//
// See ./README.md for the RawAnimal contract and how to add a new adapter.
//
// `fetchAnimalsForOrg` below enforces the contract regardless of how the
// adapter behaves — it catches throws and applies a timeout. Adapters are
// written against live third-party feeds under time pressure, so the registry
// assumes any of them may misbehave and makes that survivable: one shelter's
// broken feed degrades to zero results for that shelter, never a failed
// request for the whole search.

import seed from './seed.js';
import petpoint from './petpoint.js';
import shelterluv from './shelterluv.js';

const ADAPTERS = { seed, petpoint, shelterluv };

// A stalled feed must not hold the whole fan-out open. Matches the ceiling
// enrich.js uses for third-party page fetches.
const ADAPTER_TIMEOUT_MS = 8000;

/** Feed types with a registered adapter. */
export function listAdapters() {
  return Object.keys(ADAPTERS);
}

/** True when the adapter exists and is more than a stub. */
export function isImplemented(feedType) {
  return Boolean(ADAPTERS[feedType]?.implemented);
}

/**
 * Picks the adapter for an organization.
 *
 * `org.feedType` is set by feed detection, which is a separate workstream.
 * Until that lands, only seeded organizations resolve to an adapter.
 *
 * There is deliberately no catch-all fallback. Pointing an unknown shelter at
 * the seed adapter would return zero animals and look identical to a shelter
 * that genuinely has none — so an org with no known feed resolves to no
 * adapter and gets reported under `unsupportedOrgs` instead. "We can't read
 * this shelter yet" and "this shelter has no dogs" are different claims and
 * the response has to keep them apart.
 */
export function adapterFor(org) {
  const feedType = org?.feedType;
  if (feedType && ADAPTERS[feedType]) {
    return { feedType, adapter: ADAPTERS[feedType] };
  }
  if (org?.source === 'seed' || String(org?.id ?? '').startsWith('seed:')) {
    return { feedType: 'seed', adapter: ADAPTERS.seed };
  }
  return { feedType: 'none', adapter: null };
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

/**
 * Fetches one organization's animals through its adapter.
 *
 * Never throws and never returns null — on any failure the result is an
 * empty list plus a `warning` the caller can surface, so partial coverage is
 * reported honestly rather than looking like an empty shelter.
 *
 * @returns {{feedType: string, raw: Object[], implemented: boolean, warning: ?string}}
 */
export async function fetchAnimalsForOrg(org, opts = {}) {
  const { feedType, adapter } = adapterFor(org);

  if (!adapter || typeof adapter.fetchAnimals !== 'function') {
    // No warning: `unsupportedOrgs` already reports this, and a nationwide
    // search can touch hundreds of unmapped shelters at once. One warning per
    // org would bury the warnings that matter.
    return { feedType, raw: [], implemented: false, warning: null };
  }

  if (!adapter.implemented) {
    return { feedType, raw: [], implemented: false, warning: null };
  }

  try {
    const raw = await withTimeout(
      Promise.resolve(adapter.fetchAnimals(org, opts)),
      ADAPTER_TIMEOUT_MS,
      `${feedType} adapter for ${org?.name ?? org?.id}`,
    );
    if (!Array.isArray(raw)) {
      return { feedType, raw: [], implemented: true, warning: `${feedType} adapter returned a non-array for ${org?.name ?? org?.id}.` };
    }
    return { feedType, raw, implemented: true, warning: null };
  } catch (err) {
    console.warn(`[adapters] ${feedType} failed for ${org?.id}: ${err.message}`);
    return { feedType, raw: [], implemented: true, warning: `Could not load animals from ${org?.name ?? org?.id} (${err.message}).` };
  }
}

export default ADAPTERS;
