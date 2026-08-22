// PetPoint adapter — STUB. Not implemented; feed acquisition is a separate
// workstream.
//
// Flip `implemented` to true once fetchAnimals actually returns records.
// While it stays false the registry skips this adapter silently and the
// organization is reported under `unsupportedOrgs`, which is accurate:
// we know the shelter exists, we just can't list its animals yet.
//
// ── What to build ────────────────────────────────────────────────────────
// PetPoint is one of the most widely deployed shelter systems in the US. Its
// public webservices expose *adoptable animals only* given a shelter ID, with
// no credentials — the private client and medical records are not reachable
// this way, which is the reason this path is usable at all.
//
//   Base: https://sms.petpoint.com/sms3/embeddedmap/  (verify before relying on it)
//
// `org.feedId` carries the shelter ID once feed detection is in place. Until
// then this adapter is unreachable, because adapterFor() only selects it when
// org.feedType === 'petpoint'.
//
// ── What to return ───────────────────────────────────────────────────────
// An array of RawAnimal objects. Be as sloppy as the upstream is — casing,
// synonyms, strings-for-numbers are all fine. normalize-animal.js maps them
// onto the canonical shape, so do NOT normalize here.
//
//   {
//     sourceAnimalId: '45231',                       // REQUIRED, stable per animal
//     sourceUrl: 'https://…/detail/45231',           // REQUIRED, absolute http(s)
//     name: 'Bailey',
//     species: 'dog',                                // dog | cat | rabbit | other
//     breed: 'Labrador Retriever',                   // or breedPrimary/breedSecondary
//     sex: 'M',                                      // M/F/male/female all accepted
//     ageMonths: 30,                                 // or ageYears, or age: 'young'
//     weightLbs: 62,                                 // or size: 'Large'
//     colors: 'Black/White',                         // string or array
//     description: '…',
//     photos: ['https://…/45231.jpg'],               // strings or {url, thumbUrl}
//     status: 'Available',                           // mapped to adoptable/pending/adopted
//     goodWithDogs: 'Yes',                           // OMIT the key when unknown —
//     goodWithKids: null,                            // do not send false for "not assessed"
//   }
//
// The two required fields are the only hard ones. A record without
// sourceAnimalId can't be tracked across refreshes; one without a valid
// sourceUrl can't be adopted from, since the whole product is the hand-off to
// the shelter's own page. normalizeAnimal drops records missing either.
//
// On the tri-state fields: leave a key out entirely when the shelter didn't
// say. Sending `false` asserts the dog is bad with children, and that follows
// a real animal into a real adoption decision.
//
// ── Contract ─────────────────────────────────────────────────────────────
// Never throw — return [] on failure. Use ../cache.js. Send a descriptive
// User-Agent. See overpass.js for the failover/timeout pattern to copy.

async function fetchAnimals(_org, _opts = {}) {
  return [];
}

export default {
  feedType: 'petpoint',
  implemented: false,
  fetchAnimals,
};
