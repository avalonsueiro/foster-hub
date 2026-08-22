// Normalize stage: maps a raw OSM element (from Overpass) to the shared
// Organization shape. Deterministic string/tag inspection only — no model
// calls, no network.

import { distanceMiles } from './distance.js';

const AMENITY_KIND_MAP = {
  animal_shelter: 'animal_shelter',
  veterinary: 'veterinary',
  animal_boarding: 'animal_boarding',
};

export function classifyOrgType(tags = {}) {
  const name = (tags.name || '').toLowerCase();
  const amenity = tags.amenity || '';

  if (/\bspca\b/.test(name) || name.includes('humane society')) {
    return 'private_shelter';
  }

  if (
    name.includes('animal care and control') ||
    name.includes('animal care & control') ||
    name.includes('county') ||
    name.includes('municipal') ||
    name.includes('city of')
  ) {
    return 'municipal_shelter';
  }

  if (amenity === 'veterinary') {
    return 'veterinary';
  }

  if (amenity === 'animal_boarding') {
    return 'boarding_facility';
  }

  const hasAddress = Boolean(tags['addr:street'] || tags['addr:housenumber']);
  if ((name.includes('rescue') || name.includes('foster')) && !hasAddress) {
    return 'foster_based_rescue';
  }

  if (amenity === 'animal_shelter') {
    return name.includes('rescue') ? 'foster_based_rescue' : 'private_shelter';
  }

  return 'unknown';
}

function inferSpeciesAccepted(tags = {}) {
  const haystack = [
    tags.name,
    tags.description,
    tags['animal_shelter'],
    tags['animal_breeding'],
    tags.species,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const species = new Set();
  if (haystack.includes('dog') || tags.dog === 'yes') species.add('dog');
  if (haystack.includes('cat') || tags.cat === 'yes') species.add('cat');
  if (haystack.includes('rabbit')) species.add('rabbit');
  if (haystack.includes('wildlife') || haystack.includes('wild animal')) {
    species.add('wildlife');
  }
  return Array.from(species);
}

function buildAddress(tags = {}) {
  const street = tags['addr:street'] || null;
  const housenumber = tags['addr:housenumber'] || null;
  const city = tags['addr:city'] || null;
  const state = tags['addr:state'] || null;
  const postcode = tags['addr:postcode'] || null;

  const streetLine = [housenumber, street].filter(Boolean).join(' ') || street;

  const fullParts = [streetLine, city, state, postcode].filter(Boolean);
  const full = fullParts.length ? fullParts.join(', ') : null;

  return {
    street: streetLine || null,
    city,
    state,
    postcode,
    full,
  };
}

export function normalizeElement(el, center) {
  const tags = el.tags || {};
  const amenity = tags.amenity;
  const kind = AMENITY_KIND_MAP[amenity] || 'unknown';

  const lat = el.lat ?? el.center?.lat ?? null;
  const lon = el.lon ?? el.center?.lon ?? null;

  const dist =
    center && lat != null && lon != null
      ? Math.round(distanceMiles(center.lat, center.lon, lat, lon) * 10) / 10
      : null;

  const kindLabel = kind !== 'unknown' ? kind.replace(/_/g, ' ') : 'organization';
  const name = tags.name || `Unnamed ${kindLabel}`;

  const website = tags.website || tags['contact:website'] || null;
  const phone = tags.phone || tags['contact:phone'] || null;
  const email = tags.email || tags['contact:email'] || null;

  return {
    id: `osm:${el.type}/${el.id}`,
    name,
    kind,
    orgType: classifyOrgType(tags),
    lat,
    lon,
    distanceMiles: dist,
    address: buildAddress(tags),
    phone,
    email,
    website,
    openingHours: tags.opening_hours || null,
    speciesAccepted: inferSpeciesAccepted(tags),
    capabilities: [],
    isSynthetic: false,
    source: 'overpass',
    sourceUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    lastVerifiedAt: new Date().toISOString(),
    enrichment: null,
    raw: { ...tags },
  };
}
