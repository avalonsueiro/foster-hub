// Dogs discovery — the main Foster Fetch view. Search card + filter rail +
// card grid, all data from POST /api/animals.
//
// Live-data reality, handled honestly: most live shelters have no feed
// adapter yet, so a live search can return zero dogs while naming dozens of
// shelters in `unsupportedOrgs`. When that happens we re-query with
// useSeedData and show the server's own "fabricated seed records" warning —
// the demo stays populated, and nothing synthetic is ever presented as real.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FFHeader, { Icon, ICONS, PawIcon } from '../components/ff/FFHeader.jsx';
import DogCard, { breedLine, statLine } from '../components/ff/DogCard.jsx';
import { searchAnimals, saveDog, unsaveDog, getSaved } from '../api.js';
import { useAuth } from '../App.jsx';
import { US_CITIES } from '../data/us-cities.js';

const DEFAULT_LOCATION = 'San Francisco, CA';
const DEFAULT_RADIUS = 25;
const ANON_SAVED_KEY = 'ff-saved';
const MAX_UNSUPPORTED_PILLS = 8;

const AGE_CHIPS = [['baby', 'Puppy'], ['young', 'Young'], ['adult', 'Adult'], ['senior', 'Senior']];
const SIZE_CHIPS = [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large'], ['xlarge', 'XL']];
const SEX_CHIPS = [['any', 'Any'], ['female', 'Female'], ['male', 'Male']];
const GW_CHIPS = [['goodWithKids', 'Kids'], ['goodWithDogs', 'Dogs'], ['goodWithCats', 'Cats']];

function readAnonSaved() {
  try { return JSON.parse(localStorage.getItem(ANON_SAVED_KEY)) ?? []; } catch { return []; }
}
function writeAnonSaved(list) {
  localStorage.setItem(ANON_SAVED_KEY, JSON.stringify(list));
}

function snapshotOf(dog) {
  return {
    id: dog.id,
    name: dog.name,
    breedLine: breedLine(dog),
    photo: dog.photos?.[0]?.url ?? null,
    orgName: dog.orgName ?? null,
    sourceUrl: dog.sourceUrl,
    meta: statLine(dog),
  };
}

const MAX_SUGGESTIONS = 8;

/**
 * City suggestions for the location input. Prefix-of-any-word matching over
 * the static top-US-cities list ("san" hits San Antonio and Santa Ana; "ant"
 * hits neither) — list is roughly population-ordered, so the biggest match
 * surfaces first. Purely client-side; typing an address that isn't in the
 * list still works, it just gets no suggestions.
 */
function citySuggestions(query) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const out = [];
  for (const city of US_CITIES) {
    const lower = city.toLowerCase();
    if (lower.startsWith(q) || lower.split(/[\s,]+/).some((w) => w.startsWith(q))) {
      out.push(city);
      if (out.length === MAX_SUGGESTIONS) break;
    }
  }
  // Hide the dropdown once the field exactly matches a suggestion — nothing
  // left to suggest, and it would cover the radius slider.
  if (out.length === 1 && out[0].toLowerCase() === q) return [];
  return out;
}

function Chips({ defs, isOn, onToggle }) {
  return (
    <div className="ff-chips">
      {defs.map(([value, label]) => (
        <button
          key={value}
          type="button"
          className={`ff-chip${isOn(value) ? ' on' : ''}`}
          aria-pressed={isOn(value)}
          onClick={() => onToggle(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function DogsPage() {
  const { user } = useAuth();

  // Search
  const [location, setLocation] = useState(DEFAULT_LOCATION);
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestIndex, setSuggestIndex] = useState(-1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [result, setResult] = useState({ animals: [], unsupportedOrgs: [], warnings: [] });
  const [searchedLocation, setSearchedLocation] = useState(DEFAULT_LOCATION);
  const [searchedRadius, setSearchedRadius] = useState(DEFAULT_RADIUS);

  // Filters (client-side over the returned set)
  const [breed, setBreed] = useState('');
  const [ages, setAges] = useState(() => new Set());
  const [sizes, setSizes] = useState(() => new Set());
  const [sex, setSex] = useState('any');
  const [goodWith, setGoodWith] = useState(() => new Set());
  const [shelter, setShelter] = useState('all');
  const [sort, setSort] = useState('closest');

  // Saved dogs — server when signed in, localStorage otherwise
  const [savedIds, setSavedIds] = useState(() => new Set(readAnonSaved().map((d) => d.id)));

  const requestSeq = useRef(0);

  const runSearch = useCallback(async (loc, rad) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      // kinds: shelters only. Vets and boarding facilities never list
      // adoptable dogs, and without this they flood the "can't list yet"
      // patch with cat clinics — technically true, entirely unhelpful.
      const base = { location: loc, radiusMiles: rad, species: 'dog', kinds: ['animal_shelter'] };
      let data = await searchAnimals(base);
      let warnings = data.warnings ?? [];
      const unsupportedOrgs = data.unsupportedOrgs ?? [];
      if ((data.animals ?? []).length === 0 && unsupportedOrgs.length > 0) {
        // Live shelters found, none with a connected feed yet — fall back to
        // seed dogs so the page demonstrates, keeping the real orgs in the
        // patch and the server's fabricated-data warning visible.
        const seeded = await searchAnimals({ ...base, useSeedData: true });
        data = { ...seeded, unsupportedOrgs };
        warnings = seeded.warnings ?? [];
      }
      if (seq !== requestSeq.current) return; // a newer search superseded this one
      setResult({ animals: data.animals ?? [], unsupportedOrgs, warnings });
      setSearchedLocation(loc);
      setSearchedRadius(rad);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err.message);
      setResult({ animals: [], unsupportedOrgs: [], warnings: [] });
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => { runSearch(DEFAULT_LOCATION, DEFAULT_RADIUS); }, [runSearch]);

  // Signed-in users see their server-side saves reflected in the hearts.
  useEffect(() => {
    if (!user) { setSavedIds(new Set(readAnonSaved().map((d) => d.id))); return; }
    getSaved().then((saved) => setSavedIds(new Set(saved.map((d) => d.id)))).catch(() => {});
  }, [user]);

  async function toggleSave(dog) {
    const snapshot = snapshotOf(dog);
    const isSaved = savedIds.has(dog.id);
    // Optimistic flip — a heart that lags feels broken.
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (isSaved) next.delete(dog.id); else next.add(dog.id);
      return next;
    });
    if (user) {
      try {
        if (isSaved) await unsaveDog(dog.id); else await saveDog(snapshot);
      } catch {
        setSavedIds((prev) => { // roll back on failure
          const next = new Set(prev);
          if (isSaved) next.add(dog.id); else next.delete(dog.id);
          return next;
        });
      }
    } else {
      const list = readAnonSaved();
      writeAnonSaved(isSaved ? list.filter((d) => d.id !== dog.id) : [snapshot, ...list]);
    }
  }

  const shelters = useMemo(
    () => [...new Set(result.animals.map((d) => d.orgName).filter(Boolean))].sort(),
    [result.animals],
  );

  const filtered = useMemo(() => {
    const q = breed.trim().toLowerCase();
    let dogs = result.animals;
    if (q) dogs = dogs.filter((d) => `${d.breedPrimary ?? ''} ${d.breedSecondary ?? ''}`.toLowerCase().includes(q));
    if (ages.size) dogs = dogs.filter((d) => ages.has(d.ageGroup));
    if (sizes.size) dogs = dogs.filter((d) => sizes.has(d.sizeGroup));
    if (sex !== 'any') dogs = dogs.filter((d) => d.sex === sex);
    // Good-with filters match only an explicit yes; unknown is not a match,
    // but it is also never displayed as a "no" (see DogCard).
    if (goodWith.size) dogs = dogs.filter((d) => [...goodWith].every((k) => d.attributes?.[k] === true));
    if (shelter !== 'all') dogs = dogs.filter((d) => d.orgName === shelter);
    return [...dogs].sort((a, b) =>
      sort === 'newest'
        ? Date.parse(b.firstSeenAt ?? 0) - Date.parse(a.firstSeenAt ?? 0) || (a.distanceMiles ?? 0) - (b.distanceMiles ?? 0)
        : (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity),
    );
  }, [result.animals, breed, ages, sizes, sex, goodWith, shelter, sort]);

  const hasFilters = Boolean(breed.trim() || ages.size || sizes.size || sex !== 'any' || goodWith.size || shelter !== 'all');

  function clearFilters() {
    setBreed(''); setAges(new Set()); setSizes(new Set()); setSex('any'); setGoodWith(new Set()); setShelter('all');
  }

  const toggleIn = (setter) => (value) =>
    setter((prev) => { const next = new Set(prev); next.has(value) ? next.delete(value) : next.add(value); return next; });

  const shelterCount = new Set(filtered.map((d) => d.orgName)).size;
  const unsupported = result.unsupportedOrgs;
  const shownPills = unsupported.slice(0, MAX_UNSUPPORTED_PILLS);

  const suggestions = suggestOpen ? citySuggestions(location) : [];

  function pickSuggestion(city) {
    setLocation(city);
    setSuggestOpen(false);
    setSuggestIndex(-1);
    runSearch(city, radius);
  }

  function handleLocationKeys(e) {
    if (!suggestions.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSuggestIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSuggestIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && suggestIndex >= 0) {
      e.preventDefault();
      pickSuggestion(suggestions[suggestIndex]);
    } else if (e.key === 'Escape') {
      setSuggestOpen(false);
      setSuggestIndex(-1);
    }
  }

  return (
    <div className="ff-page">
      <FFHeader />

      <section className="ff-hero">
        <h1>Find a dog to foster near you</h1>
        <p>Every adoptable dog from every shelter we can reach, in one place — each one links straight to its own shelter.</p>
        <form
          className="ff-search-card"
          onSubmit={(e) => { e.preventDefault(); runSearch(location.trim() || DEFAULT_LOCATION, radius); }}
        >
          <div className="ff-field ff-field--icon" style={{ position: 'relative' }}>
            <label htmlFor="ff-loc">Location</label>
            <Icon d={ICONS.mapPin} size={18} stroke="var(--ff-text-soft)" />
            <input
              id="ff-loc" className="ff-input ff-input--icon" type="text"
              placeholder="City, zip, or address" value={location}
              onChange={(e) => { setLocation(e.target.value); setSuggestOpen(true); setSuggestIndex(-1); }}
              onFocus={() => setSuggestOpen(true)}
              onBlur={() => setTimeout(() => setSuggestOpen(false), 120)} // let a click on a suggestion land first
              onKeyDown={handleLocationKeys}
              autoComplete="off"
              role="combobox"
              aria-expanded={suggestions.length > 0}
              aria-autocomplete="list"
            />
            {suggestions.length > 0 ? (
              <div className="ff-suggest" role="listbox">
                {suggestions.map((city, i) => (
                  <button
                    key={city} type="button" role="option"
                    aria-selected={i === suggestIndex}
                    className={i === suggestIndex ? 'active' : ''}
                    // mousedown, not click — it fires before the input's blur
                    onMouseDown={(e) => { e.preventDefault(); pickSuggestion(city); }}
                  >
                    <Icon d={ICONS.mapPin} size={14} stroke="var(--ff-accent-400)" />
                    {city}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="ff-field">
            <label htmlFor="ff-radius">Distance — within {radius} miles</label>
            <input
              id="ff-radius" className="ff-range" type="range" min={1} max={100} step={1}
              value={radius} onChange={(e) => setRadius(Number(e.target.value))}
            />
          </div>
          <button className="ff-btn ff-btn--primary" type="submit" disabled={loading}>
            {loading ? 'Searching…' : 'Search'}
          </button>
        </form>
        <p className="ff-hero__note">Showing dogs near {searchedLocation} — change the location above.</p>
      </section>

      <main className="ff-main">
        <aside className="ff-rail">
          <div>
            <h3>Breed</h3>
            <input
              className="ff-input" style={{ fontSize: 14.5, padding: '10px 16px' }} type="text"
              placeholder="e.g. terrier" value={breed} onChange={(e) => setBreed(e.target.value)}
            />
          </div>
          <div><h3>Age</h3><Chips defs={AGE_CHIPS} isOn={(v) => ages.has(v)} onToggle={toggleIn(setAges)} /></div>
          <div><h3>Size</h3><Chips defs={SIZE_CHIPS} isOn={(v) => sizes.has(v)} onToggle={toggleIn(setSizes)} /></div>
          <div><h3>Sex</h3><Chips defs={SEX_CHIPS} isOn={(v) => sex === v} onToggle={setSex} /></div>
          <div>
            <h3>Good with</h3>
            <Chips defs={GW_CHIPS} isOn={(v) => goodWith.has(v)} onToggle={toggleIn(setGoodWith)} />
            <p className="ff-hint">Shows only dogs a shelter marked "yes" — many dogs are simply unassessed.</p>
          </div>
          <div>
            <h3>Shelter</h3>
            <select className="ff-select" value={shelter} onChange={(e) => setShelter(e.target.value)}>
              <option value="all">All shelters</option>
              {shelters.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
          {hasFilters ? (
            <button type="button" className="ff-btn ff-btn--ghost" onClick={clearFilters}>Clear all filters</button>
          ) : null}
        </aside>

        <section>
          <div className="ff-results-head">
            <h2 className="ff-count">
              {loading
                ? 'Searching…'
                : `${filtered.length} dog${filtered.length === 1 ? '' : 's'} from ${shelterCount} shelter${shelterCount === 1 ? '' : 's'} within ${searchedRadius} miles of ${searchedLocation}`}
            </h2>
            <Chips defs={[['closest', 'Closest'], ['newest', 'Newest']]} isOn={(v) => sort === v} onToggle={setSort} />
          </div>

          {error ? <div className="ff-error" role="alert">{error}</div> : null}

          {!loading && result.warnings.length > 0 ? (
            <p className="ff-hint" style={{ marginBottom: 16 }} role="status">{result.warnings.join(' ')}</p>
          ) : null}

          {loading ? (
            <>
              <p className="ff-loading-note">
                Checking shelters and rescues near {location.trim() || DEFAULT_LOCATION} — results come in as each one answers…
              </p>
              <div className="ff-grid" style={{ marginTop: 16 }}>
                {Array.from({ length: 8 }, (_, i) => (
                  <div className="ff-skel" key={i}>
                    <div className="img" />
                    <div className="lines">
                      <div className="ln" style={{ height: 16, width: '55%' }} />
                      <div className="ln" style={{ width: '80%' }} />
                      <div className="ln" style={{ width: '65%' }} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : filtered.length === 0 ? (
            <div className="ff-empty">
              <div className="ff-disc"><PawIcon size={30} color="var(--ff-accent)" /></div>
              <div className="ttl">No dogs match within {searchedRadius} miles</div>
              <p style={{ margin: 0, fontSize: 15, color: 'var(--ff-text-soft)', maxWidth: 380 }}>
                Try widening the radius or clearing a filter — new dogs arrive at these shelters every day.
              </p>
              {hasFilters ? (
                <button type="button" className="ff-btn ff-btn--outline" onClick={clearFilters}>Clear all filters</button>
              ) : null}
            </div>
          ) : (
            <div className="ff-grid">
              {filtered.map((dog) => (
                <DogCard key={dog.id} dog={dog} saved={savedIds.has(dog.id)} onToggleSave={toggleSave} />
              ))}
            </div>
          )}

          {!loading && unsupported.length > 0 ? (
            <div className="ff-partial" style={{ marginTop: 22 }}>
              <div className="ttl">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--ff-green-800)"
                  strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
                </svg>
                {unsupported.length} more rescue{unsupported.length === 1 ? '' : 's'} nearby we can't list yet
              </div>
              <p>
                We've found these organizations but haven't connected to their animal feeds —{' '}
                <strong>their dogs exist, we just can't show them here yet</strong>. Check their sites directly:
              </p>
              <div className="orgs">
                {shownPills.map((org) =>
                  org.website ? (
                    <a key={org.id} className="ff-org-pill" href={org.website}
                      target="_blank" rel="noopener noreferrer">
                      {org.name}
                      <Icon d={ICONS.external} size={13} />
                    </a>
                  ) : (
                    // No website on record — a pill that links nowhere reads
                    // as broken, so render it as plain text instead.
                    <span key={org.id} className="ff-org-pill" style={{ cursor: 'default' }}>{org.name}</span>
                  ),
                )}
                {unsupported.length > shownPills.length ? (
                  <span className="ff-org-pill" style={{ cursor: 'default' }}>
                    + {unsupported.length - shownPills.length} more
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          <p className="ff-hint" style={{ marginTop: 28 }}>
            Looking for shelters, vets, and boarding instead? <a href="#/orgs">Try the organizations view</a>.
          </p>
        </section>
      </main>
    </div>
  );
}
