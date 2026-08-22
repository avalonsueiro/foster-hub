// ShelterLuv adapter — STUB. Not implemented; feed acquisition is a separate
// workstream.
//
// Flip `implemented` to true once fetchAnimals actually returns records.
//
// ── What to build ────────────────────────────────────────────────────────
// ShelterLuv publishes adoptable animals per organization. Unlike PetPoint,
// access is typically per-org API key rather than open — so this adapter may
// need a key in env (e.g. SHELTERLUV_API_KEY) and should return [] when the
// key is absent rather than throwing at import time.
//
// `org.feedId` carries the ShelterLuv org identifier once feed detection is
// in place.
//
// ── What to return ───────────────────────────────────────────────────────
// The same RawAnimal shape petpoint.js documents in full — see that file for
// the annotated example. The two required fields:
//
//   sourceAnimalId   stable per animal
//   sourceUrl        absolute http(s) link to the shelter's own listing
//
// Everything else is optional and gets normalized downstream. Omit keys you
// don't know; never send `false` to mean "not assessed".
//
// ── Contract ─────────────────────────────────────────────────────────────
// Never throw — return [] on failure. Use ../cache.js. Send a descriptive
// User-Agent. See overpass.js for the failover/timeout pattern to copy.

async function fetchAnimals(_org, _opts = {}) {
  return [];
}

export default {
  feedType: 'shelterluv',
  implemented: false,
  fetchAnimals,
};
