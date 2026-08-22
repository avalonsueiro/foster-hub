// The shared shape for a single adoptable animal, plus the controlled
// vocabularies every adapter must map onto and a plain-JS validator.
//
// No zod here on purpose: this server's only dependencies are express and
// cors, and these checks are simple enough that pulling in a schema library
// would cost more than it saves. `validateAnimal` returns a list of problems
// rather than throwing, so a single bad record from one shelter can be
// dropped without taking down the whole response.

export const SPECIES = ['dog', 'cat', 'rabbit', 'other'];
export const AGE_GROUPS = ['baby', 'young', 'adult', 'senior'];
export const SEXES = ['male', 'female', 'unknown'];
export const SIZE_GROUPS = ['small', 'medium', 'large', 'xlarge'];
export const STATUSES = ['adoptable', 'pending', 'adopted', 'unknown'];

// Tri-state, always. `null` means the shelter didn't say — which is not the
// same as "no", and must never be rendered as one. Telling an adopter a dog
// is bad with children when nobody actually assessed it is a real harm to a
// real animal, so the unknown case gets its own value all the way through.
export const ATTRIBUTE_KEYS = [
  'goodWithDogs',
  'goodWithCats',
  'goodWithKids',
  'houseTrained',
  'specialNeeds',
];

/**
 * The canonical Animal shape. Every field is present on every record —
 * absent data is an explicit null, never a missing key, so consumers never
 * have to distinguish "not provided" from "not fetched yet".
 *
 * @typedef  {Object} Animal
 * @property {string}  id             `${source}:${sourceAnimalId}`
 * @property {string}  orgId          Joins to Organization.id
 * @property {string}  name
 * @property {string}  species        One of SPECIES
 * @property {?string} breedPrimary
 * @property {?string} breedSecondary
 * @property {?boolean} isMix
 * @property {?string} ageGroup       One of AGE_GROUPS
 * @property {?number} ageMonths
 * @property {string}  sex            One of SEXES
 * @property {?string} sizeGroup      One of SIZE_GROUPS
 * @property {?number} weightLbs
 * @property {string[]} colors
 * @property {?string} description
 * @property {{url: string, thumbUrl: ?string}[]} photos
 * @property {Object}  attributes     ATTRIBUTE_KEYS -> true | false | null
 * @property {string}  status         One of STATUSES
 * @property {string}  sourceUrl      REQUIRED — the shelter's own page for this animal
 * @property {string}  source         Feed type that produced the record
 * @property {string}  sourceAnimalId
 * @property {boolean} isSynthetic
 * @property {?string} firstSeenAt    ISO 8601
 * @property {string}  lastSeenAt     ISO 8601
 */

/** An attributes object with every key explicitly unknown. */
export function emptyAttributes() {
  return Object.fromEntries(ATTRIBUTE_KEYS.map((key) => [key, null]));
}

/**
 * Checks a normalized Animal against the vocabularies above.
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateAnimal(animal) {
  const errors = [];

  if (!animal || typeof animal !== 'object') {
    return { ok: false, errors: ['record is not an object'] };
  }

  for (const field of ['id', 'orgId', 'name', 'source', 'sourceAnimalId']) {
    if (typeof animal[field] !== 'string' || !animal[field]) {
      errors.push(`${field} must be a non-empty string`);
    }
  }

  // The whole product is the hand-off to the shelter's own listing. A record
  // that can't redirect is not a lesser record, it's a broken one.
  if (typeof animal.sourceUrl !== 'string' || !isHttpUrl(animal.sourceUrl)) {
    errors.push('sourceUrl must be an absolute http(s) URL');
  }

  if (!SPECIES.includes(animal.species)) {
    errors.push(`species must be one of ${SPECIES.join(', ')}`);
  }
  if (!SEXES.includes(animal.sex)) {
    errors.push(`sex must be one of ${SEXES.join(', ')}`);
  }
  if (!STATUSES.includes(animal.status)) {
    errors.push(`status must be one of ${STATUSES.join(', ')}`);
  }
  if (animal.ageGroup != null && !AGE_GROUPS.includes(animal.ageGroup)) {
    errors.push(`ageGroup must be null or one of ${AGE_GROUPS.join(', ')}`);
  }
  if (animal.sizeGroup != null && !SIZE_GROUPS.includes(animal.sizeGroup)) {
    errors.push(`sizeGroup must be null or one of ${SIZE_GROUPS.join(', ')}`);
  }

  if (!Array.isArray(animal.photos)) {
    errors.push('photos must be an array');
  }
  if (!Array.isArray(animal.colors)) {
    errors.push('colors must be an array');
  }

  if (!animal.attributes || typeof animal.attributes !== 'object') {
    errors.push('attributes must be an object');
  } else {
    for (const key of ATTRIBUTE_KEYS) {
      const value = animal.attributes[key];
      if (value !== true && value !== false && value !== null) {
        errors.push(`attributes.${key} must be true, false, or null`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

export function isHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
