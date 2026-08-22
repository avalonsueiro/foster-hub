// POST /api/animals — adoptable animals across every organization near a
// location, each one carrying a link back to the shelter's own listing.
//
// Read-only and deterministic, like /api/search: fan out to per-shelter feed
// adapters, normalize, filter in plain code, sort. No model call anywhere.
// Filtering in particular stays in JS on purpose — size, age and "good with
// cats" are hard constraints, and hard constraints don't get delegated to
// something that might guess.
//
// The handler is built via a factory rather than importing the organization
// search directly: index.js owns that logic (including dedupe), so it passes
// it in. That keeps this file free of a circular import and leaves index.js
// as the single place organizations are resolved.

import { fetchAnimalsForOrg } from './adapters/index.js';
import { normalizeAnimals } from './normalize-animal.js';
import { ATTRIBUTE_KEYS, SPECIES, STATUSES } from './animal-schema.js';

const DEFAULT_CONCURRENCY = 8;

// Adopted animals are excluded unless asked for. They're still fetched and
// counted, so `counts.filteredOut` can say how many were removed rather than
// the list silently shrinking — a shelter looking emptier than it is reads as
// a bug. Pass `status: 'all'` to keep everything.
const DEFAULT_STATUSES = ['adoptable', 'pending', 'unknown'];

/** Runs `task` over `items` with at most `limit` in flight. */
async function pool(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await task(items[i], i);
    }
  }

  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

function parseStatusFilter(raw) {
  if (raw === 'all') return null; // null means "don't filter"
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : null;
  if (!list) return DEFAULT_STATUSES;
  const valid = list.filter((s) => STATUSES.includes(s));
  return valid.length ? valid : DEFAULT_STATUSES;
}

function asList(value) {
  if (value == null) return null;
  const list = Array.isArray(value) ? value : [value];
  const cleaned = list.filter((v) => typeof v === 'string' && v.trim());
  return cleaned.length ? cleaned : null;
}

/**
 * Applies the caller's filters. Every one is a hard constraint resolved here
 * in plain code.
 *
 * Attribute filters match only explicit `true`. An animal whose shelter never
 * assessed it (`null`) is not returned for "good with kids" — but it is also
 * never labelled as bad with them. Omission is the honest handling of unknown;
 * asserting either way would not be.
 */
function applyFilters(animals, filters) {
  const { statuses, sizeGroups, ageGroups, sexes, breed, attributes } = filters;

  return animals.filter((animal) => {
    if (statuses && !statuses.includes(animal.status)) return false;
    if (sizeGroups && !sizeGroups.includes(animal.sizeGroup)) return false;
    if (ageGroups && !ageGroups.includes(animal.ageGroup)) return false;
    if (sexes && !sexes.includes(animal.sex)) return false;

    if (breed) {
      const haystack = `${animal.breedPrimary ?? ''} ${animal.breedSecondary ?? ''}`.toLowerCase();
      if (!haystack.includes(breed.toLowerCase())) return false;
    }

    for (const key of attributes) {
      if (animal.attributes[key] !== true) return false;
    }

    return true;
  });
}

/**
 * @param {Object} deps
 * @param {Function} deps.resolveOrganizations  async (body) => {status?, error?, center, resolvedName, organizations, warnings}
 */
export function createAnimalsHandler({ resolveOrganizations }) {
  return async function animalsHandler(req, res) {
    const body = req.body || {};

    // Organizations come from the same resolution path /api/search uses, so
    // the two endpoints can never disagree about what's nearby.
    const resolved = await resolveOrganizations(body);
    if (resolved.error) {
      return res.status(resolved.status || 400).json({ error: resolved.error });
    }

    const { center, resolvedName, organizations, warnings: orgWarnings } = resolved;
    const warnings = [...orgWarnings];

    // `useSeedData` is handled upstream in resolveOrganizations, which skips
    // every live source when it's set — so `organizations` is already the
    // seeded list by the time we get here.
    if (body.useSeedData === true) {
      warnings.push('Animals in this response are fabricated seed records, not live shelter listings.');
    }

    // Optional narrowing to specific shelters the client already has.
    const orgIds = asList(body.orgIds);
    const targets = orgIds
      ? organizations.filter((org) => orgIds.includes(org.id))
      : organizations;

    if (orgIds && targets.length === 0) {
      warnings.push('None of the requested orgIds are within this search area.');
    }

    const species = SPECIES.includes(body.species) ? body.species : 'dog';
    const perOrgLimit = Number.isFinite(Number(body.limitPerOrg)) ? Number(body.limitPerOrg) : undefined;

    const fetched = await pool(targets, DEFAULT_CONCURRENCY, async (org) => {
      const { feedType, raw, implemented, warning } = await fetchAnimalsForOrg(org, {
        species,
        limit: perOrgLimit,
      });
      const { animals, rejected } = normalizeAnimals(raw, org, { source: feedType });
      return { org, feedType, animals, rejected, implemented, warning };
    });

    const unsupportedOrgs = [];
    let allAnimals = [];
    let rejectedCount = 0;

    for (const result of fetched) {
      if (result.warning) warnings.push(result.warning);
      if (!result.implemented) {
        // Naming these is the point. A shelter we can locate but can't list
        // animals for is partial coverage, and hiding it would read as "this
        // shelter has no dogs" — which is a different and untrue claim.
        unsupportedOrgs.push({
          id: result.org.id,
          name: result.org.name,
          feedType: result.feedType,
          website: result.org.website ?? null,
          distanceMiles: result.org.distanceMiles ?? null,
        });
        continue;
      }

      rejectedCount += result.rejected.length;
      for (const animal of result.animals) {
        // Denormalize the few org fields a listing needs, so the client
        // doesn't have to join two collections to render one card.
        allAnimals.push({
          ...animal,
          orgName: result.org.name,
          orgWebsite: result.org.website ?? null,
          distanceMiles: result.org.distanceMiles ?? null,
        });
      }
    }

    if (rejectedCount > 0) {
      warnings.push(`${rejectedCount} listing(s) were dropped for missing an identifier or a usable link.`);
    }

    const statuses = parseStatusFilter(body.status);
    const beforeStatus = allAnimals.length;

    const requestedAttributes = ATTRIBUTE_KEYS.filter((key) => body[key] === true || body.filters?.[key] === true);

    allAnimals = applyFilters(allAnimals, {
      statuses,
      sizeGroups: asList(body.sizeGroup ?? body.filters?.sizeGroup),
      ageGroups: asList(body.ageGroup ?? body.filters?.ageGroup),
      sexes: asList(body.sex ?? body.filters?.sex),
      breed: typeof body.breed === 'string' && body.breed.trim() ? body.breed.trim() : null,
      attributes: requestedAttributes,
    });

    // Nearest first; within one shelter, most recently seen first.
    allAnimals.sort((a, b) => {
      const byDistance = (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity);
      if (byDistance !== 0) return byDistance;
      return String(b.lastSeenAt).localeCompare(String(a.lastSeenAt));
    });

    const byOrg = {};
    const bySource = {};
    const byStatus = {};
    for (const animal of allAnimals) {
      byOrg[animal.orgId] = (byOrg[animal.orgId] || 0) + 1;
      bySource[animal.source] = (bySource[animal.source] || 0) + 1;
      byStatus[animal.status] = (byStatus[animal.status] || 0) + 1;
    }

    if (allAnimals.length === 0 && unsupportedOrgs.length > 0) {
      warnings.push(
        `No listings available yet — ${unsupportedOrgs.length} nearby organization(s) have no animal feed connected.`,
      );
    }

    res.json({
      query: {
        location: body.location ?? null,
        radiusMiles: resolved.radiusMiles,
        center,
        resolvedName,
        species,
        statuses,
      },
      counts: {
        total: allAnimals.length,
        filteredOut: beforeStatus - allAnimals.length,
        organizationsSearched: targets.length,
        organizationsWithoutFeed: unsupportedOrgs.length,
        byOrg,
        bySource,
        byStatus,
      },
      animals: allAnimals,
      unsupportedOrgs,
      warnings,
    });
  };
}
