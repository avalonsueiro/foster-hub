// Normalize stage: maps a loose RawAnimal from any feed adapter onto the
// canonical Animal shape. Deterministic string/number coercion only — no
// model calls, no network. Mirrors normalize.js, which does the same job for
// organizations.
//
// Adapters are deliberately allowed to be sloppy: they hand back whatever
// their upstream gave them, in whatever casing, and this file is the single
// place that decides what a "medium" dog or a "young" one actually means.
// That keeps the per-shelter adapters short enough that a teammate can write
// one in twenty minutes.

import {
  AGE_GROUPS,
  SEXES,
  SIZE_GROUPS,
  SPECIES,
  STATUSES,
  emptyAttributes,
  isHttpUrl,
  validateAnimal,
} from './animal-schema.js';

// Dog-oriented thresholds. Cats and rabbits mature faster, but every source
// we expect to see reports its own age band anyway — these only fire when a
// feed gives a raw number and no band.
const AGE_MONTH_BANDS = [
  { max: 6, group: 'baby' },
  { max: 24, group: 'young' },
  { max: 96, group: 'adult' },
  { max: Infinity, group: 'senior' },
];

const WEIGHT_LB_BANDS = [
  { max: 25, group: 'small' },
  { max: 60, group: 'medium' },
  { max: 100, group: 'large' },
  { max: Infinity, group: 'xlarge' },
];

const AGE_SYNONYMS = {
  baby: 'baby',
  puppy: 'baby',
  kitten: 'baby',
  infant: 'baby',
  young: 'young',
  juvenile: 'young',
  adolescent: 'young',
  adult: 'adult',
  grown: 'adult',
  senior: 'senior',
  geriatric: 'senior',
};

const SIZE_SYNONYMS = {
  small: 'small',
  s: 'small',
  toy: 'small',
  tiny: 'small',
  medium: 'medium',
  m: 'medium',
  med: 'medium',
  large: 'large',
  l: 'large',
  big: 'large',
  xlarge: 'xlarge',
  xl: 'xlarge',
  'extra large': 'xlarge',
  giant: 'xlarge',
};

const STATUS_SYNONYMS = {
  adoptable: 'adoptable',
  available: 'adoptable',
  'available for adoption': 'adoptable',
  active: 'adoptable',
  pending: 'pending',
  'adoption pending': 'pending',
  hold: 'pending',
  adopted: 'adopted',
  placed: 'adopted',
};

function cleanString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function cleanNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

/**
 * Coerces a feed's idea of a boolean into true | false | null.
 *
 * Anything unrecognized becomes null rather than false. A shelter that
 * simply didn't fill in "good with kids" must not end up asserting that the
 * animal is bad with them.
 */
export function triState(value) {
  if (value === true || value === false) return value;
  if (value === 1) return true;
  if (value === 0) return false;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (['true', 'yes', 'y', '1'].includes(v)) return true;
    if (['false', 'no', 'n', '0'].includes(v)) return false;
  }
  return null;
}

function bandFor(value, bands) {
  if (value == null) return null;
  return bands.find((band) => value < band.max)?.group ?? bands[bands.length - 1].group;
}

function normalizeAgeGroup(raw) {
  const explicit = cleanString(raw.ageGroup) || cleanString(raw.age);
  if (explicit) {
    const mapped = AGE_SYNONYMS[explicit.toLowerCase()];
    if (mapped) return mapped;
    if (AGE_GROUPS.includes(explicit.toLowerCase())) return explicit.toLowerCase();
  }
  const months = cleanNumber(raw.ageMonths) ?? (cleanNumber(raw.ageYears) != null ? cleanNumber(raw.ageYears) * 12 : null);
  return bandFor(months, AGE_MONTH_BANDS);
}

function normalizeSizeGroup(raw) {
  const explicit = cleanString(raw.sizeGroup) || cleanString(raw.size);
  if (explicit) {
    const mapped = SIZE_SYNONYMS[explicit.toLowerCase()];
    if (mapped) return mapped;
    if (SIZE_GROUPS.includes(explicit.toLowerCase())) return explicit.toLowerCase();
  }
  return bandFor(cleanNumber(raw.weightLbs), WEIGHT_LB_BANDS);
}

function normalizePhotos(raw) {
  const source = raw.photos ?? raw.photo ?? raw.images ?? [];
  const list = Array.isArray(source) ? source : [source];

  const photos = [];
  const seen = new Set();
  for (const entry of list) {
    const url = typeof entry === 'string' ? entry : cleanString(entry?.url ?? entry?.full ?? entry?.large);
    if (!isHttpUrl(url) || seen.has(url)) continue;
    seen.add(url);
    const thumbUrl = typeof entry === 'object' ? cleanString(entry?.thumbUrl ?? entry?.thumb ?? entry?.small) : null;
    photos.push({ url, thumbUrl: isHttpUrl(thumbUrl) ? thumbUrl : null });
  }
  return photos;
}

function normalizeColors(raw) {
  const source = raw.colors ?? raw.color ?? [];
  const list = Array.isArray(source) ? source : String(source).split(/[,/]/);
  return list.map((c) => cleanString(c)).filter(Boolean);
}

function normalizeAttributes(raw) {
  const from = raw.attributes && typeof raw.attributes === 'object' ? raw.attributes : raw;
  return {
    goodWithDogs: triState(from.goodWithDogs ?? from.good_with_dogs ?? from.dogs),
    goodWithCats: triState(from.goodWithCats ?? from.good_with_cats ?? from.cats),
    goodWithKids: triState(from.goodWithKids ?? from.good_with_children ?? from.children),
    houseTrained: triState(from.houseTrained ?? from.house_trained ?? from.housetrained),
    specialNeeds: triState(from.specialNeeds ?? from.special_needs),
  };
}

/**
 * Maps one RawAnimal onto the canonical Animal shape.
 *
 * @param {Object} raw   Whatever the adapter returned
 * @param {Object} org   The Organization this animal belongs to
 * @param {Object} [opts]
 * @param {string} [opts.source]  Feed type, when the raw record omits it
 * @returns {{animal: ?Object, errors: string[]}} `animal` is null when the
 *          record is unusable — the caller decides whether to log or ignore.
 */
export function normalizeAnimal(raw, org, opts = {}) {
  if (!raw || typeof raw !== 'object') {
    return { animal: null, errors: ['raw record is not an object'] };
  }
  if (!org || !org.id) {
    return { animal: null, errors: ['org with an id is required'] };
  }

  const source = cleanString(raw.source) || cleanString(opts.source) || 'unknown';
  const sourceAnimalId = cleanString(raw.sourceAnimalId) || cleanString(raw.id) || null;
  const sourceUrl = cleanString(raw.sourceUrl) || cleanString(raw.url) || null;

  // Bail early on the two fields with no sensible default. An animal we can't
  // identify can't be deduped across refreshes, and one we can't link to
  // can't be adopted — neither is worth showing.
  if (!sourceAnimalId) {
    return { animal: null, errors: ['missing sourceAnimalId'] };
  }
  if (!isHttpUrl(sourceUrl)) {
    return { animal: null, errors: [`missing or invalid sourceUrl (${sourceUrl ?? 'null'})`] };
  }

  const species = SPECIES.includes(cleanString(raw.species)?.toLowerCase())
    ? cleanString(raw.species).toLowerCase()
    : 'dog';

  const sexRaw = cleanString(raw.sex)?.toLowerCase();
  const sex = sexRaw === 'm' ? 'male' : sexRaw === 'f' ? 'female' : SEXES.includes(sexRaw) ? sexRaw : 'unknown';

  const statusRaw = cleanString(raw.status)?.toLowerCase();
  const status = STATUS_SYNONYMS[statusRaw] ?? (STATUSES.includes(statusRaw) ? statusRaw : 'unknown');

  const now = new Date().toISOString();

  const animal = {
    id: `${source}:${sourceAnimalId}`,
    orgId: org.id,
    name: cleanString(raw.name) || 'Unnamed',
    species,
    breedPrimary: cleanString(raw.breedPrimary) || cleanString(raw.breed) || null,
    breedSecondary: cleanString(raw.breedSecondary) || null,
    isMix: triState(raw.isMix ?? raw.mixed),
    ageGroup: normalizeAgeGroup(raw),
    ageMonths: cleanNumber(raw.ageMonths) ?? (cleanNumber(raw.ageYears) != null ? Math.round(cleanNumber(raw.ageYears) * 12) : null),
    sex,
    sizeGroup: normalizeSizeGroup(raw),
    weightLbs: cleanNumber(raw.weightLbs),
    colors: normalizeColors(raw),
    description: cleanString(raw.description),
    photos: normalizePhotos(raw),
    attributes: { ...emptyAttributes(), ...normalizeAttributes(raw) },
    status,
    sourceUrl,
    source,
    sourceAnimalId,
    isSynthetic: raw.isSynthetic === true,
    firstSeenAt: cleanString(raw.firstSeenAt) || now,
    lastSeenAt: now,
  };

  const { ok, errors } = validateAnimal(animal);
  return ok ? { animal, errors: [] } : { animal: null, errors };
}

/**
 * Normalizes a batch, discarding unusable records.
 * @returns {{animals: Object[], rejected: {raw: Object, errors: string[]}[]}}
 */
export function normalizeAnimals(rawList, org, opts = {}) {
  const animals = [];
  const rejected = [];

  for (const raw of Array.isArray(rawList) ? rawList : []) {
    const { animal, errors } = normalizeAnimal(raw, org, opts);
    if (animal) animals.push(animal);
    else rejected.push({ raw, errors });
  }

  return { animals, rejected };
}
