import { useState } from 'react';

const KIND_OPTIONS = [
  { value: 'animal_shelter', label: 'Shelters & rescues' },
  { value: 'veterinary', label: 'Vets' },
  { value: 'animal_boarding', label: 'Boarding' },
];

/**
 * Location text input, radius slider, kind checkboxes, synthetic toggle,
 * and a submit button. Submitting is always allowed, even with an empty
 * location — the caller decides what to show for bad input.
 */
export default function SearchBar({
  location,
  radiusMiles,
  kinds,
  includeSynthetic,
  onLocationChange,
  onRadiusChange,
  onKindsChange,
  onIncludeSyntheticChange,
  onSubmit,
  onUseCurrentLocation,
  isLoading,
}) {
  const [draftLocation, setDraftLocation] = useState(location);
  const [isLocating, setIsLocating] = useState(false);
  const [geoError, setGeoError] = useState(null);
  // Once set, re-submitting the form reuses these coordinates instead of
  // trying to geocode the literal "Current location" placeholder text.
  // Cleared as soon as the user edits the location field by hand.
  const [currentCoords, setCurrentCoords] = useState(null);

  function handleLocationInput(value) {
    setDraftLocation(value);
    setCurrentCoords(null);
  }

  function handleSubmit(event) {
    event.preventDefault();
    onLocationChange(draftLocation);
    if (currentCoords) {
      onSubmit({ location: draftLocation, lat: currentCoords.lat, lon: currentCoords.lon });
    } else {
      onSubmit(draftLocation);
    }
  }

  function handleUseCurrentLocation() {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by this browser.');
      return;
    }

    setGeoError(null);
    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        const { latitude, longitude } = position.coords;
        setDraftLocation('Current location');
        setCurrentCoords({ lat: latitude, lon: longitude });
        onUseCurrentLocation(latitude, longitude);
      },
      (err) => {
        setIsLocating(false);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? 'Location access denied. Enable it in your browser settings, or type a location instead.'
            : 'Could not determine your location. Try typing a location instead.'
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  }

  function toggleKind(value) {
    if (kinds.includes(value)) {
      onKindsChange(kinds.filter((k) => k !== value));
    } else {
      onKindsChange([...kinds, value]);
    }
  }

  return (
    <form className="search-bar" onSubmit={handleSubmit}>
      <div className="search-bar__field search-bar__field--location">
        <label htmlFor="location-input">Location</label>
        <div className="search-bar__location-row">
          <input
            id="location-input"
            type="text"
            placeholder="City, zip, or address"
            value={draftLocation}
            onChange={(event) => handleLocationInput(event.target.value)}
            autoComplete="off"
          />
          <button
            type="button"
            className="button button--secondary search-bar__geolocate"
            onClick={handleUseCurrentLocation}
            disabled={isLocating}
            title="Use my current location"
          >
            {isLocating ? 'Locating…' : '📍 Use my location'}
          </button>
        </div>
        {geoError ? <p className="search-bar__geo-error">{geoError}</p> : null}
      </div>

      <div className="search-bar__field search-bar__field--radius">
        <label htmlFor="radius-input">Radius: {radiusMiles} miles</label>
        <input
          id="radius-input"
          type="range"
          min={5}
          max={100}
          step={1}
          value={radiusMiles}
          onChange={(event) => onRadiusChange(Number(event.target.value))}
        />
      </div>

      <fieldset className="search-bar__field search-bar__field--kinds">
        <legend>Show</legend>
        <div className="search-bar__checkboxes">
          {KIND_OPTIONS.map((option) => (
            <label key={option.value} className="checkbox-label">
              <input
                type="checkbox"
                checked={kinds.includes(option.value)}
                onChange={() => toggleKind(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="checkbox-label search-bar__synthetic">
        <input
          type="checkbox"
          checked={includeSynthetic}
          onChange={(event) => onIncludeSyntheticChange(event.target.checked)}
        />
        Show demo foster homes (not real)
      </label>

      <button type="submit" className="button button--primary" disabled={isLoading}>
        {isLoading ? 'Searching…' : 'Search'}
      </button>
    </form>
  );
}
