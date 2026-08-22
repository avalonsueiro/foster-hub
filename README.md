# dog-agentic-search

Find animal shelters, rescues, vets, and boarding facilities near a Bay
Area location — a search bar over live OpenStreetMap data, with a seeded
fallback dataset so the demo survives a dead venue wifi.

## Data sources (free, no API keys)

- **Nominatim** (`nominatim.openstreetmap.org`) — turns a free-text location
  into coordinates. Rate-limited to ~1 request/second and requires a
  descriptive `User-Agent` header; both are already handled in
  `server/src/geocode.js`.
- **Overpass API** (`overpass-api.de`, with `overpass.private.coffee` and
  `overpass.kumi.systems` as mirrors) — the actual radius query against OSM
  for `amenity=animal_shelter|veterinary|animal_boarding`. Also needs a
  descriptive `User-Agent` and is rate-limited; see `server/src/overpass.js`
  for the retry/fallback order.
- **Neither Brave Search nor DuckDuckGo is used.** Brave's free search API
  tier ended in February 2026, and DuckDuckGo has no supported free JSON
  search API — so there's no free, keyless text-search provider left to
  lean on here. Everything is done through Nominatim + Overpass instead.

If both OSM services are unreachable, the server falls back to
`server/data/seed-bay-area.json` so the app still renders a full result set.

## Install & run

From the project root:

```bash
npm run install:all   # installs server/ and web/ dependencies
npm run dev            # runs server (8787) and web (5173) concurrently
```

Or individually: `npm run dev:server` / `npm run dev:web`.

- Server: http://localhost:8787
- Web: http://localhost:5173

## `/api/search` contract

`POST /api/search` — JSON body:

| Field               | Type     | Notes                                                        |
|---------------------|----------|--------------------------------------------------------------|
| `location`          | string   | Free-text place, geocoded via Nominatim                      |
| `lat`, `lon`        | number   | Alternative to `location` — skips geocoding entirely         |
| `radiusMiles`       | number   | Search radius in miles; clamped to 1–100, defaults to 30      |
| `kinds`             | string[] | Any of `animal_shelter`, `veterinary`, `animal_boarding`     |
| `includeNonprofits` | boolean  | IRS registry source. Default **true**                        |
| `includeSynthetic`  | boolean  | Add fabricated foster-home records. Default false            |
| `useSeedData`       | boolean  | Skip all live sources and serve the seed file. Default false |
| `enrich`            | boolean  | Fetch each org's homepage for email/keywords. Default false  |

One of `location` or `lat`/`lon` is required; without either the server
returns `400`. An unresolvable `location` returns `422`.

Response: `200 OK` with an **object**, not a bare array:

```json
{
  "query":   { "location": "...", "radiusMiles": 25, "center": {...}, "resolvedName": "..." },
  "counts":  { "total": 352, "byKind": {...}, "bySource": {...} },
  "organizations": [ /* Organization objects, nearest first */ ],
  "warnings": [ "..." ]
}
```

Each organization carries `distanceMiles` from the query point. On upstream
failure the server serves the same shape from the seed file rather than
erroring, and says so in `warnings`.

## `/api/animals` contract

`POST /api/animals` — adoptable animals across every organization near a
location. Accepts everything `/api/search` does (organizations are resolved
through the same path), plus:

| Field                                       | Type              | Notes                                                     |
|---------------------------------------------|-------------------|------------------------------------------------------------|
| `orgIds`                                    | string[]          | Narrow to specific shelters already in range               |
| `species`                                   | string            | `dog` \| `cat` \| `rabbit` \| `other`. Default `dog`       |
| `status`                                    | string \| string[] | Default excludes `adopted`; pass `"all"` to keep everything |
| `sizeGroup`, `ageGroup`, `sex`              | string \| string[] | Hard filters                                              |
| `breed`                                     | string            | Case-insensitive substring match                           |
| `goodWithDogs`, `goodWithCats`, `goodWithKids`, `houseTrained`, `specialNeeds` | boolean | Pass `true` to require it |
| `limitPerOrg`                               | number            | Cap results per shelter                                    |

```json
{
  "query":   { "species": "dog", "statuses": ["adoptable","pending","unknown"], ... },
  "counts":  { "total": 26, "filteredOut": 1, "organizationsSearched": 20,
               "organizationsWithoutFeed": 0, "byOrg": {...}, "byStatus": {...} },
  "animals": [ /* Animal objects, nearest first */ ],
  "unsupportedOrgs": [ /* shelters we can locate but can't yet list animals for */ ],
  "warnings": [ "..." ]
}
```

Two things worth knowing about the shape:

- **`sourceUrl` is mandatory on every animal.** The product is the hand-off to
  the shelter's own listing, so a record that can't link out is dropped during
  normalization rather than shown.
- **`unsupportedOrgs` is not an error.** "We can't read this shelter's feed
  yet" and "this shelter has no dogs" are different claims, and an aggregator
  that conflates them is lying about its coverage. Organizations without a
  connected feed are named here instead of silently omitted.

The five behavioural attributes (`goodWithDogs` and friends) are **tri-state**:
`true`, `false`, or `null` for "the shelter didn't say". Filters match only
explicit `true`. See `server/src/adapters/README.md` for why that distinction
is load-bearing, and for how to add a new shelter feed.

Animal feeds currently ship as one working adapter (`seed`) and two stubs
(`petpoint`, `shelterluv`), so live shelters resolve to `unsupportedOrgs`
until those land. `useSeedData: true` exercises the full pipeline offline.

## Data provenance

- All non-synthetic records (`isSynthetic: false`) are real, publicly
  listed organizations — verified by hand against their own sites, Yelp,
  and similar public listings as of the date in `lastVerifiedAt`. Where a
  detail (phone, precise address) couldn't be confirmed, it's `null`
  rather than guessed.
- `lastVerifiedAt` appears on seed records only, because those are the ones a
  person actually checked. Machine-fetched OSM and IRS records carry
  `fetchedAt` instead — calling a scraped tag "verified" would claim more than
  we know.
- The 12 records with `isSynthetic: true` (`id` prefixed `synthetic:`,
  `orgType: "foster_based_rescue"`) are **fabricated** individual foster
  homes. Private foster households are not public data, so these exist
  only to demo filtering/search behavior for that org type — names like
  "Foster home #4 (synthetic)" are deliberately non-identifying, with no
  real street address, phone, or email attached.
- **Every animal in `server/data/seed-dogs.json` is fabricated.** All 27 are
  flagged `isSynthetic: true` and exist to exercise the normalizer and keep
  the pipeline demonstrable offline. Their `sourceUrl` points at the real
  adoption page of the shelter they're attached to, so the hand-off is
  exercised too — but no dog listed there is a real animal, and responses
  containing them say so in `warnings`.
