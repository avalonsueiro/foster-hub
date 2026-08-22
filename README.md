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

`GET /api/search` — query params:

| Param         | Type    | Notes                                              |
|---------------|---------|-----------------------------------------------------|
| `location`    | string  | Free-text place, geocoded via Nominatim             |
| `lat`, `lon`  | number  | Alternative to `location` — skips geocoding         |
| `radiusMiles` | number  | Search radius, in miles                             |
| `kinds`       | string  | Comma-separated: `animal_shelter,veterinary,animal_boarding` |

Response: `200 OK` with a JSON array of Organization objects (see the shape
in `server/data/seed-bay-area.json`), each with `distanceMiles` computed
from the query point. On upstream failure the server returns the same
shape sourced from the seed file instead of erroring.

## Data provenance

- All non-synthetic records (`isSynthetic: false`) are real, publicly
  listed organizations — verified by hand against their own sites, Yelp,
  and similar public listings as of the date in `lastVerifiedAt`. Where a
  detail (phone, precise address) couldn't be confirmed, it's `null`
  rather than guessed.
- The 12 records with `isSynthetic: true` (`id` prefixed `synthetic:`,
  `orgType: "foster_based_rescue"`) are **fabricated** individual foster
  homes. Private foster households are not public data, so these exist
  only to demo filtering/search behavior for that org type — names like
  "Foster home #4 (synthetic)" are deliberately non-identifying, with no
  real street address, phone, or email attached.
