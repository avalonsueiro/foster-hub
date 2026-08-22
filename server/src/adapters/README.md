# Animal feed adapters

An adapter answers one question: **given an organization, what animals does it
currently have up for adoption, and where does each one live on that
organization's own website?**

That second half is the product. Foster Hub does not host listings — it
aggregates them and hands the visitor off to the shelter. An animal record
without a working link out is not a partial record, it's a broken one.

## The interface

One file per feed type, default-exporting three things:

```js
export default {
  feedType: 'petpoint',   // must match the filename and the registry key
  implemented: true,      // false while it's a stub
  fetchAnimals,           // async (org, { species, limit }) => RawAnimal[]
};
```

Register it in `index.js`:

```js
import petpoint from './petpoint.js';
const ADAPTERS = { seed, petpoint, shelterluv };
```

`adapterFor(org)` selects by `org.feedType`, which is populated by feed
detection (a separate workstream). Orgs without one fall back to the `seed`
adapter.

## The RawAnimal contract

Return records as close to what upstream gave you as possible. Casing,
synonyms, numbers-as-strings, `'Yes'`/`'No'` — all fine.
`../normalize-animal.js` is the single place that decides what "medium" or
"young" means, so **do not normalize inside an adapter**. Keeping that logic
in one file is what makes a new adapter a twenty-minute job.

| Field | Required | Notes |
|---|---|---|
| `sourceAnimalId` | **yes** | Stable per animal, so it survives refreshes |
| `sourceUrl` | **yes** | Absolute `http(s)` link to the shelter's own listing |
| `name` | no | Defaults to `"Unnamed"` |
| `species` | no | `dog` \| `cat` \| `rabbit` \| `other`; defaults to `dog` |
| `breed` / `breedPrimary` / `breedSecondary` | no | |
| `sex` | no | `M`, `F`, `male`, `female` all accepted |
| `ageMonths` / `ageYears` / `age` | no | A number, or a band like `'puppy'` |
| `weightLbs` / `size` | no | A number, or `'S'`/`'Large'`/`'XL'` |
| `colors` | no | Array, or a `'Black/White'` string |
| `description` | no | |
| `photos` | no | Array of URL strings or `{url, thumbUrl}` |
| `status` | no | `'Available'`, `'Adoption Pending'`, etc. |
| `goodWithDogs`, `goodWithCats`, `goodWithKids`, `houseTrained`, `specialNeeds` | no | See below |

Records missing either required field are dropped by `normalizeAnimal`, which
returns the reason in `errors` so you can see why during development.

## Tri-state attributes — the one rule that isn't mechanical

The five behavioural attributes are `true | false | null`, and `null` means
*the shelter didn't say*.

**Omit the key entirely when you don't know.** Do not send `false`.

`false` on `goodWithKids` asserts that this specific dog is bad with children.
That claim follows a real animal into a real adoption decision, and a shelter
that simply left the field blank has not made it. `triState()` in
`normalize-animal.js` maps anything unrecognized to `null` for exactly this
reason.

## Behavioural contract

- **Never throw.** Return `[]` on any failure. The registry wraps you in a
  try/catch and an 8s timeout anyway, but an adapter that fails quietly and
  returns nothing produces a better result than one that fails loudly.
- **Cache.** Use `../cache.js` (`getCached` / `setCached`) with a TTL that
  suits the feed. Adoptable rosters change slowly; an hour is generous.
- **Identify yourself.** Send a descriptive `User-Agent` — these are small
  nonprofits' servers.
- **Copy the failover pattern in `../overpass.js`** if the feed has mirrors or
  is flaky. It sets timeouts and endpoint ordering from measurement, and the
  comments explain why.

## Testing a new adapter

```bash
npm run dev:server

curl -X POST localhost:8787/api/animals \
  -H 'Content-Type: application/json' \
  -d '{"location":"San Francisco, CA","radiusMiles":25,"species":"dog"}'
```

Check the response's `unsupportedOrgs` — organizations there have no working
adapter yet. Once yours is implemented and detection assigns its `feedType`,
those shelters should move into `animals` instead.
