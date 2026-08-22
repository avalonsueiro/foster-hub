const KIND_LABELS = {
  animal_shelter: 'Animal shelters',
  veterinary: 'Vets',
  animal_boarding: 'Boarding',
};

function labelForKind(kind) {
  return KIND_LABELS[kind] || kind;
}

/**
 * Summary stats: total found, breakdown by kind, resolved location, radius.
 * All counts are right-aligned.
 */
export default function StatsBar({ counts, resolvedName, radiusMiles }) {
  if (!counts) return null;

  const byKindEntries = Object.entries(counts.byKind || {}).filter(([, count]) => count > 0);

  return (
    <div className="stats-bar">
      <div className="stat-tile">
        <span className="stat-tile__label">Total found</span>
        <span className="stat-tile__value">{counts.total ?? 0}</span>
      </div>

      {byKindEntries.map(([kind, count]) => (
        <div className="stat-tile" key={kind}>
          <span className="stat-tile__label">{labelForKind(kind)}</span>
          <span className="stat-tile__value">{count}</span>
        </div>
      ))}

      <div className="stat-tile stat-tile--wide">
        <span className="stat-tile__label">Searching near</span>
        <span className="stat-tile__value stat-tile__value--text" title={resolvedName || ''}>
          {resolvedName || 'Unknown location'}
        </span>
      </div>

      <div className="stat-tile">
        <span className="stat-tile__label">Radius</span>
        <span className="stat-tile__value">{radiusMiles} mi</span>
      </div>
    </div>
  );
}
