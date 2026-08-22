import { useEffect, useMemo, useState } from 'react';
import EmptyState from './EmptyState.jsx';

const ORG_TYPE_LABELS = {
  municipal_shelter: 'Shelter',
  private_shelter: 'Shelter',
  foster_based_rescue: 'Foster rescue',
  veterinary: 'Vet',
  boarding_facility: 'Boarding',
  unknown: 'Other',
};

const COLUMNS = [
  { key: 'name', label: 'Name', align: 'left' },
  { key: 'website', label: 'Website', align: 'left' },
  { key: 'orgType', label: 'Type', align: 'left' },
];

function googleMapsUrl(org) {
  if (typeof org.lat === 'number' && typeof org.lon === 'number') {
    return `https://www.google.com/maps/search/?api=1&query=${org.lat},${org.lon}`;
  }
  if (org.address?.full) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(org.address.full)}`;
  }
  return null;
}

function getSortValue(org, key) {
  switch (key) {
    case 'name':
      return (org.name || '').toLowerCase();
    case 'website':
      return org.website || '';
    case 'orgType':
      return ORG_TYPE_LABELS[org.orgType] || org.orgType || '';
    case 'distanceMiles':
      return typeof org.distanceMiles === 'number' ? org.distanceMiles : Infinity;
    default:
      return '';
  }
}

function matchesFilter(org, filterText) {
  if (!filterText) return true;
  const haystack = `${org.name || ''} ${org.address?.city || ''}`.toLowerCase();
  return haystack.includes(filterText.toLowerCase());
}

const PAGE_SIZE = 10;

/**
 * Sortable, filterable table of organizations. Row click selects a row
 * (highlighting the matching map marker) — it never triggers an action.
 */
export default function ResultsTable({
  organizations,
  isLoading,
  selectedId,
  onSelectRow,
  hasSearched,
}) {
  const [filterText, setFilterText] = useState('');
  const [sortKey, setSortKey] = useState('distanceMiles');
  const [sortDirection, setSortDirection] = useState('asc');
  const [page, setPage] = useState(1);

  const filtered = useMemo(
    () => organizations.filter((org) => matchesFilter(org, filterText)),
    [organizations, filterText]
  );

  const sorted = useMemo(() => {
    const copy = [...filtered];
    const direction = sortDirection === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      if (va < vb) return -1 * direction;
      if (va > vb) return 1 * direction;
      return 0;
    });
    return copy;
  }, [filtered, sortKey, sortDirection]);

  useEffect(() => {
    setPage(1);
  }, [organizations]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paged = useMemo(
    () => sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [sorted, currentPage]
  );

  function handleSort(key) {
    setPage(1);
    if (key === sortKey) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  }

  function handleFilterChange(value) {
    setPage(1);
    setFilterText(value);
  }

  return (
    <div className="results-table">
      <div className="results-table__toolbar">
        <input
          type="text"
          className="results-table__filter"
          placeholder="Filter by name or city"
          value={filterText}
          onChange={(event) => handleFilterChange(event.target.value)}
          disabled={isLoading}
        />
        <span className="results-table__count">
          {isLoading ? 'Loading…' : `${sorted.length} of ${organizations.length} shown`}
        </span>
      </div>

      <div className="results-table__scroll">
        <table>
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  className={column.align === 'right' ? 'align-right' : ''}
                  onClick={() => handleSort(column.key)}
                  aria-sort={
                    sortKey === column.key
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <span className="results-table__th-label">
                    {column.label}
                    {sortKey === column.key ? (
                      <span className="results-table__sort-indicator">
                        {sortDirection === 'asc' ? ' ▲' : ' ▼'}
                      </span>
                    ) : null}
                  </span>
                </th>
              ))}
              <th>Map</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: PAGE_SIZE }).map((_, index) => (
                  <tr className="skeleton-row" key={`skeleton-${index}`}>
                    {COLUMNS.map((column) => (
                      <td key={column.key}>
                        <span className="skeleton-block" />
                      </td>
                    ))}
                    <td>
                      <span className="skeleton-block" />
                    </td>
                  </tr>
                ))
              : paged.map((org) => {
                  const mapsUrl = googleMapsUrl(org);
                  return (
                    <tr
                      key={org.id}
                      className={org.id === selectedId ? 'is-selected' : ''}
                      onClick={() => onSelectRow && onSelectRow(org.id)}
                    >
                      <td title={org.name || ''} className="results-table__name">
                        {org.name || 'Unnamed organization'}
                        {org.isSynthetic ? <span className="badge badge--synthetic">Demo</span> : null}
                      </td>
                      <td title={org.website || ''} className="results-table__website">
                        {org.website ? (
                          <a
                            href={org.website}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {org.website.replace(/^https?:\/\//, '')}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td title={ORG_TYPE_LABELS[org.orgType] || org.orgType || ''} className="truncate">
                        {ORG_TYPE_LABELS[org.orgType] || org.orgType || '—'}
                      </td>
                      <td>
                        {mapsUrl ? (
                          <a
                            href={mapsUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            title={
                              org.locationPrecision === 'city'
                                ? 'Registered city only — not a street address'
                                : 'Open in Google Maps'
                            }
                          >
                            📍 Map{org.locationPrecision === 'city' ? ' (~city)' : ''}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {!isLoading && sorted.length > PAGE_SIZE ? (
        <div className="results-table__pagination">
          <button
            type="button"
            className="button button--secondary"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
          >
            ← Previous
          </button>
          <span className="results-table__page-indicator">
            Page {currentPage} of {pageCount}
          </span>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={currentPage >= pageCount}
          >
            Next →
          </button>
        </div>
      ) : null}

      {!isLoading && sorted.length === 0 ? (
        <EmptyState
          glyph={hasSearched ? '🔍' : '🐾'}
          title={
            hasSearched
              ? organizations.length === 0
                ? 'No organizations found in this radius'
                : 'No rows match your filter'
              : 'Search results will appear here'
          }
          description={
            hasSearched
              ? organizations.length === 0
                ? 'Try a bigger radius, a different location, or check more of the boxes above.'
                : 'Clear the search box above to see all results again.'
              : 'Type a location above and hit search to see what\'s nearby.'
          }
        />
      ) : null}
    </div>
  );
}
