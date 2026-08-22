import { useState } from 'react';
import SearchBar from '../components/SearchBar.jsx';
import StatsBar from '../components/StatsBar.jsx';
import MapView from '../components/MapView.jsx';
import ResultsTable from '../components/ResultsTable.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { searchOrganizations } from '../api.js';
import logo from '../assets/logo.svg';

// Default to shelters and rescues only. Vets and boarding are useful for a
// coordinator who already knows the animal, but they roughly double the
// row count for someone trying to place one dog — opt-in via the checkboxes.
const DEFAULT_KINDS = ['animal_shelter'];

export default function OrgsPage() {
  const [location, setLocation] = useState('');
  const [radiusMiles, setRadiusMiles] = useState(10);
  const [kinds, setKinds] = useState(DEFAULT_KINDS);
  const [includeSynthetic, setIncludeSynthetic] = useState(false);

  const [hasSearched, setHasSearched] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  async function runSearch(options = {}) {
    const override = typeof options === 'string' ? { location: options } : options;
    const searchLocation = (override.location ?? location).trim();
    const hasCoords = override.lat != null && override.lon != null;

    setHasSearched(true);
    setError(null);
    setIsLoading(true);
    setSelectedId(null);

    if (!searchLocation && !hasCoords) {
      setIsLoading(false);
      setError('Please type a city, zip code, or address to search.');
      setResult(null);
      return;
    }

    try {
      const response = await searchOrganizations({
        location: searchLocation,
        lat: hasCoords ? override.lat : undefined,
        lon: hasCoords ? override.lon : undefined,
        radiusMiles,
        kinds,
        includeSynthetic,
      });
      setResult(response);
    } catch (err) {
      setError(err.message || 'Search failed. Please try again.');
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  }

  function handleQuickFill() {
    setLocation('San Francisco, CA');
    runSearch('San Francisco, CA');
  }

  function handleUseCurrentLocation(lat, lon) {
    setLocation('Current location');
    runSearch({ location: 'Current location', lat, lon });
  }

  const organizations = result?.organizations || [];
  const center = result?.query?.center || null;
  const effectiveRadius = result?.query?.radiusMiles ?? radiusMiles;
  const warnings = result?.warnings || [];

  const showInitialEmptyState = !hasSearched && !isLoading;

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__title">
          <div className="app__title-row">
            <img src={logo} alt="" className="app__logo" />
            <h1>Foster Fetch</h1>
          </div>
          <p className="app__subtitle">
            Find animal shelters, vets, and boarding nearby.
          </p>
        </div>
        <SearchBar
          location={location}
          radiusMiles={radiusMiles}
          kinds={kinds}
          includeSynthetic={includeSynthetic}
          onLocationChange={setLocation}
          onRadiusChange={setRadiusMiles}
          onKindsChange={setKinds}
          onIncludeSyntheticChange={setIncludeSynthetic}
          onSubmit={runSearch}
          onUseCurrentLocation={handleUseCurrentLocation}
          isLoading={isLoading}
        />
      </header>

      {error ? (
        <div className="banner banner--error" role="alert">
          <strong>Search failed.</strong> {error}
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="banner banner--warning" role="status">
          {warnings.map((warning, index) => (
            <p key={index}>{warning}</p>
          ))}
        </div>
      ) : null}

      {result ? (
        <StatsBar
          counts={result.counts}
          resolvedName={result.query?.resolvedName}
          radiusMiles={effectiveRadius}
        />
      ) : null}

      {showInitialEmptyState ? (
        <EmptyState
          glyph="🐾"
          title="Where should we look?"
          description="Type in a city, zip code, or address above, or use your current location, and we'll show shelters, vets, and boarding nearby."
          actionLabel="Try San Francisco, CA"
          onAction={handleQuickFill}
        />
      ) : (
        <main className="app__main">
          <section className="app__map">
            <MapView
              center={center}
              radiusMiles={effectiveRadius}
              organizations={organizations}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
            {isLoading ? (
              <div className="app__map-overlay">
                <span>Searching…</span>
              </div>
            ) : null}
          </section>

          <section className="app__table">
            <ResultsTable
              organizations={organizations}
              isLoading={isLoading}
              selectedId={selectedId}
              onSelectRow={setSelectedId}
              hasSearched={hasSearched}
            />
          </section>
        </main>
      )}
    </div>
  );
}
