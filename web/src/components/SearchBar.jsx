import { useState } from 'react';

const KIND_OPTIONS = [
  { value: 'animal_shelter', label: 'Animal shelters' },
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
  isLoading,
}) {
  const [draftLocation, setDraftLocation] = useState(location);

  function handleSubmit(event) {
    event.preventDefault();
    onLocationChange(draftLocation);
    onSubmit(draftLocation);
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
        <input
          id="location-input"
          type="text"
          placeholder="City, zip, or address"
          value={draftLocation}
          onChange={(event) => setDraftLocation(event.target.value)}
          autoComplete="off"
        />
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
        Include synthetic foster homes
      </label>

      <button type="submit" className="button button--primary" disabled={isLoading}>
        {isLoading ? 'Searching…' : 'Search'}
      </button>
    </form>
  );
}
