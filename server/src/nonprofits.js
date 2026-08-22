// Cold-path source: IRS-registered animal-welfare nonprofits via the
// ProPublica Nonprofit Explorer API. Free, no API key, no signup.
//
// Why this source exists alongside Overpass:
// Overpass maps PLACES. A foster-based rescue has no premises, so it is
// structurally invisible there — measured recall was ~90% for facilities
// with buildings but ~11% for foster-based rescues. ProPublica indexes
// ORGANISATIONS, and returned 10/10 of the rescues Overpass missed.
//
// It also carries the field that actually gates a transfer: `subseccd === 3`
// means IRS-recognised 501(c)(3), which under the Hayden Act (CA Food & Ag
// Code s31108/31752) gives a rescue the right to request an animal before
// euthanasia. That is a legal status, not a badge.
//
// Limitation, handled below: ProPublica returns city/state but NO lat/lon.
// We resolve location at CITY level only. For a foster-based rescue that is
// honest anyway — there is no building to point at.

import { getCached, setCached } from './cache.js';
import { distanceMiles } from './distance.js';
import { geocodeLocation } from './geocode.js';

const API = 'https://projects.propublica.org/nonprofits/api/v2/search.json';
const NTEE_ENV_AND_ANIMALS = 3;
const PAGE_SIZE = 25;
const MAX_PAGES = 8;               // ~200 orgs; warmed at boot so searches stay fast
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_GAP_MS = 350;        // be a good citizen; no documented hard limit

// NTEE group 3 is "Environment AND Animals", which is far too broad — it
// returns California Trout, WildAid and the Zoological Society alongside
// actual rescues. Precision matters more than recall here: a placement
// coordinator cannot phone a fish conservation charity about a dog.
//
// Keep: companion-animal shelters, rescues, humane societies, SPCAs.
// Drop: wildlife, conservation, zoos, aquariums, research, advocacy.
const RESCUE_NAME_RE = /\b(rescue|humane|spca|s\.p\.c\.a|shelter|adoption|adopt|foster|animal care|animal services|animal control|pet\b|pets\b|dog|dogs|cat|cats|kitten|puppy|puppies|paws|feline|canine|spay|neuter)\b/i;

// Orgs that are registered locally but cannot take in a local dog or cat.
// Each group below was added after seeing it in real ProPublica output.
const EXCLUDE_PATTERNS = [
  // Wildlife / conservation / environment
  /\b(wildlife|wildaid|conservation|conservancy|zoo|zoological|aquarium|trout|salmon|fisher|farallones|audubon|raptor|habitat|ecolog|environment|land trust|watershed|birding|ornitholog|reef|whale|marine)\b/i,
  // Non-companion species — a shelter placing a dog cannot use these
  /\b(horse|horses|equine|equestrian|pony|mustang|burro|donkey|pig|pigs|swine|goat|sheep|cattle|livestock|farm|barn|hay|pasture|ranch|reptile|snake|turtle|tortoise|dragon|avian|bird|birds|parrot|loriidae|poultry|chicken|elephant|primate|bat)\b/i,
  // Registered here, operating overseas
  /\b(international|worldwide|global|borders|lebanon|bali|india|punjab|china|japan|mexico|allende|anguilla|africa|america central|central america|ukraine|taiwan|korea|thailand|philippines|romania|greece|turkey|egypt|nepal|peru|ecuador)\b/i,
  // Dog parks, clubs, sport, training, service/therapy, grooming, advocacy
  /\b(dog park|dog parks|owners group|dog group|training club|obedience|agility|police|k9 association|reiki|yoga|pet cuts|grooming|groomer|diabetics|service dog|therapy|guide dog|breed club|kennel club|show|advocacy|legal|law &|policy|ethics|vegan|vegetarian|beautiful|green initiative|garden)\b/i,
  // Fundraising auxiliaries — they support a shelter, they are not one
  /^friends of\b/i,
  /\bfoundation trust\b/i,
];

// Positive signal that this org actually houses or places companion animals.
const PLACEMENT_RE = /\b(rescue|shelter|humane|spca|s\.p\.c\.a|adoption|adopt|foster|spay|neuter|animal care|animal services|animal control|sanctuary|cat|cats|kitten|kittens|feline|dog|dogs|puppy|puppies|canine|pup|paws|pet|pets|strays?|ferals?|rehome)\b/i;

const NTEE_KEEP_RE = /^D2/i;

function isCompanionAnimalOrg(o) {
  const name = o.name || '';
  if (!name) return false;
  if (EXCLUDE_PATTERNS.some((re) => re.test(name))) return false;
  // Requiring a keyword in the NAME was too strict — it dropped Milo
  // Foundation, Bad Rap and House Rabbit Society, all real rescues with
  // distinctive names. An IRS Animal Protection & Welfare code (D2x) is
  // sufficient on its own; the exclusion list above carries the precision.
  return NTEE_KEEP_RE.test(String(o.ntee_code || '')) || PLACEMENT_RE.test(name);
}

// Pre-seeded Bay Area city centroids. Avoids a 400-request Nominatim storm on
// first run (Nominatim allows 1 req/sec, so geocoding every org would take
// ~7 minutes). Unknown cities fall back to Nominatim and are then cached.
const CITY_CENTROIDS = {
  'san francisco': [37.7749, -122.4194], 'oakland': [37.8044, -122.2712],
  'berkeley': [37.8715, -122.2730], 'san jose': [37.3382, -121.8863],
  'daly city': [37.6879, -122.4702], 'south san francisco': [37.6547, -122.4077],
  'pacifica': [37.6138, -122.4869], 'san mateo': [37.5630, -122.3255],
  'redwood city': [37.4852, -122.2364], 'palo alto': [37.4419, -122.1430],
  'mountain view': [37.3861, -122.0839], 'sunnyvale': [37.3688, -122.0363],
  'santa clara': [37.3541, -121.9552], 'milpitas': [37.4323, -121.8996],
  'fremont': [37.5485, -121.9886], 'hayward': [37.6688, -122.0808],
  'san leandro': [37.7249, -122.1561], 'alameda': [37.7652, -122.2416],
  'richmond': [37.9358, -122.3477], 'albany': [37.8869, -122.2977],
  'el cerrito': [37.9161, -122.3108], 'walnut creek': [37.9101, -122.0652],
  'concord': [37.9780, -122.0311], 'martinez': [38.0194, -122.1341],
  'pleasanton': [37.6624, -121.8747], 'livermore': [37.6819, -121.7680],
  'dublin': [37.7022, -121.9358], 'san rafael': [37.9735, -122.5311],
  'novato': [38.1074, -122.5697], 'mill valley': [37.9060, -122.5450],
  'petaluma': [38.2324, -122.6367], 'santa rosa': [38.4404, -122.7141],
  'napa': [38.2975, -122.2869], 'vallejo': [38.1041, -122.2566],
  'fairfield': [38.2494, -122.0400], 'burlingame': [37.5841, -122.3661],
  'san bruno': [37.6305, -122.4111], 'menlo park': [37.4530, -122.1817],
  'cupertino': [37.3230, -122.0322], 'campbell': [37.2872, -121.9500],
  'los gatos': [37.2358, -121.9624], 'saratoga': [37.2638, -122.0230],
  'morgan hill': [37.1305, -121.6544], 'gilroy': [37.0058, -121.5683],
  'half moon bay': [37.4636, -122.4286], 'sausalito': [37.8591, -122.4853],
  'emeryville': [37.8313, -122.2852], 'union city': [37.5934, -122.0438],
  'newark': [37.5297, -122.0402], 'castro valley': [37.6941, -122.0863],
  'point richmond': [37.9230, -122.3880], 'lafayette': [37.8858, -122.1180],
  'orinda': [37.8771, -122.1797], 'danville': [37.8216, -121.9999],
  'san ramon': [37.7799, -121.9780], 'antioch': [38.0049, -121.8058],
  'pittsburg': [38.0280, -121.8847], 'brentwood': [37.9319, -121.6958],
  'san carlos': [37.5072, -122.2605], 'belmont': [37.5202, -122.2758],
  'foster city': [37.5585, -122.2711], 'millbrae': [37.5985, -122.3872],
};

let lastRequestAt = 0;
async function throttled(url) {
  const wait = REQUEST_GAP_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'dog-agentic-search/0.1 (hackathon project)' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function resolveCity(city, state) {
  if (!city) return null;
  const key = city.trim().toLowerCase();
  const hit = CITY_CENTROIDS[key];
  if (hit) return { lat: hit[0], lon: hit[1], approximate: true };

  const cacheKey = `city:${key},${state}`;
  const cached = getCached(cacheKey, 30 * 24 * 60 * 60 * 1000);
  if (cached) return cached;

  try {
    const geo = await geocodeLocation(`${city}, ${state}`);
    const value = { lat: geo.lat, lon: geo.lon, approximate: true };
    setCached(cacheKey, value);
    return value;
  } catch {
    return null;
  }
}

/**
 * Fetch registered nonprofits for ONE city. Cached 24h.
 *
 * ProPublica has no radius filter, only `state`. Paging blindly through every
 * Californian animal nonprofit was the wrong shape: CA has thousands, the
 * first 200 are arbitrary, and the small Bay Area rescues we actually want
 * never appeared. Testing showed `q=<city>` matches the CITY field (q=oakland
 * returned 24/25 orgs located in Oakland), so we query city by city instead.
 */
async function fetchCityOrgs(city, state) {
  // v2 key: page depth changed, old entries would be short.
  const cacheKey = `propublica:city:v2:${city.toLowerCase()},${state}`;
  const cached = getCached(cacheKey, CACHE_TTL_MS);
  if (cached) return cached;

  // Big cities have hundreds of registered nonprofits; two pages missed
  // Wonder Cat Rescue and Grateful Dogs Rescue in San Francisco. Go deeper
  // for dense cities, stay shallow elsewhere. Cached 24h either way.
  const DENSE = ['san francisco', 'oakland', 'san jose', 'berkeley'];
  const maxPages = DENSE.includes(city.toLowerCase()) ? 6 : 2;

  const out = [];
  for (let page = 0; page < maxPages; page++) {
    const url = `${API}?q=${encodeURIComponent(city)}&state%5Bid%5D=${state}` +
                `&ntee%5Bid%5D=${NTEE_ENV_AND_ANIMALS}&page=${page}`;
    try {
      const data = await throttled(url);
      const orgs = data.organizations || [];
      // `q` is fuzzy — it also matches similarly-named places ("Pacific Grove"
      // for "Pacifica"). Keep only exact city hits.
      out.push(...orgs.filter((o) => (o.city || '').toLowerCase() === city.toLowerCase()));
      if (orgs.length < PAGE_SIZE) break;
    } catch (err) {
      console.warn(`[nonprofits] ${city} page ${page} failed: ${err.message}`);
      break;
    }
  }
  setCached(cacheKey, out);
  return out;
}

/** Cities from our centroid table that fall inside the search radius. */
function citiesInRadius(center, radiusMiles) {
  return Object.entries(CITY_CENTROIDS)
    .map(([city, [lat, lon]]) => ({
      city,
      lat,
      lon,
      dist: distanceMiles(center.lat, center.lon, lat, lon),
    }))
    .filter((c) => c.dist <= radiusMiles)
    .sort((a, b) => a.dist - b.dist);
}

function toOrganization(raw, coords, center) {
  const is501c3 = raw.subseccd === 3;
  const dist = coords
    ? Math.round(distanceMiles(center.lat, center.lon, coords.lat, coords.lon) * 10) / 10
    : null;

  return {
    id: `irs:${raw.ein}`,
    name: raw.name,
    kind: 'animal_shelter',
    orgType: 'foster_based_rescue',
    lat: coords ? coords.lat : null,
    lon: coords ? coords.lon : null,
    distanceMiles: dist,
    address: {
      street: null,
      city: raw.city || null,
      state: raw.state || null,
      postcode: null,
      full: raw.city
        ? `${raw.city}, ${raw.state} — registered address, city-level only`
        : null,
    },
    phone: null,
    email: null,
    website: null,
    openingHours: null,
    speciesAccepted: [],
    capabilities: [],
    // Compliance fields — the ones that actually gate a transfer.
    ein: raw.ein ? String(raw.ein) : null,
    is501c3,
    haydenTransferRight: is501c3,
    complianceSource: `https://projects.propublica.org/nonprofits/organizations/${raw.ein}`,
    complianceVerifiedAt: new Date().toISOString(),
    isSynthetic: false,
    source: 'irs',
    sourceUrl: `https://projects.propublica.org/nonprofits/organizations/${raw.ein}`,
    lastVerifiedAt: new Date().toISOString(),
    locationPrecision: 'city',
    enrichment: null,
    raw: { ntee_code: raw.ntee_code, subseccd: raw.subseccd },
  };
}

/**
 * Registered animal-welfare nonprofits within `radiusMiles` of `center`.
 * Never throws — returns [] so the caller degrades to Overpass-only results.
 */
export async function fetchNonprofitsNear({ center, radiusMiles, state = 'CA' }) {
  try {
    const cities = citiesInRadius(center, radiusMiles);
    if (!cities.length) return [];

    const out = [];
    const seenEins = new Set();
    for (const c of cities) {
      const raws = await fetchCityOrgs(c.city, state);
      for (const raw of raws) {
        if (!raw.name || seenEins.has(raw.ein)) continue;
        if (!isCompanionAnimalOrg(raw)) continue;
        seenEins.add(raw.ein);
        const org = toOrganization(raw, { lat: c.lat, lon: c.lon, approximate: true }, center);
        if (org.distanceMiles != null && org.distanceMiles <= radiusMiles) out.push(org);
      }
    }
    console.log(`[nonprofits] ${out.length} companion-animal nonprofits across ${cities.length} cities within ${radiusMiles}mi`);
    return out;
  } catch (err) {
    console.warn(`[nonprofits] unavailable: ${err.message}`);
    return [];
  }
}

/** Warm the registry cache for the busiest Bay Area cities at boot. */
export function prewarm(state = 'CA') {
  const seeds = ['san francisco', 'oakland', 'berkeley', 'san jose', 'san rafael'];
  (async () => {
    for (const c of seeds) {
      try { await fetchCityOrgs(c, state); } catch {}
    }
    console.log(`[nonprofits] prewarmed ${seeds.length} cities`);
  })();
}
