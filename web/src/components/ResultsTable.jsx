import { useMemo, useState } from 'react';
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
  { key: 'orgType', label: 'Type', align: 'left' },
  { key: 'distanceMiles', label: 'Distance', align: 'right' },
  { key: 'city', label: 'City', align: 'left' },
  { key: 'phone', label: 'Phone', align: 'left' },
  { key: 'website', label: 'Website', align: 'left' },
];

function getSortValue(org, key) {
  switch (key) {
    case 'name':
      return (org.name || '').toLowerCase();
    case 'orgType':
      return ORG_TYPE_LABELS[org.orgType] || org.orgType || '';
    case 'distanceMiles':
      return typeof org.distanceMiles === 'number' ? org.distanceMiles : Infinity;
    case 'city':
      return (org.address?.city || '').toLowerCase();
    case 'phone':
      return org.phone || '';
    case 'website':
      return org.website || '';
    default:
      return '';
  }
}

function matchesFilter(org, filterText) {
  if (!filterText) return true;
  const haystack = `${org.name || ''} ${org.address?.city || ''}`.toLowerCase();
  return haystack.includes(filterText.toLowerCase());
}

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

  function handleSort(key) {
    if (key === sortKey) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  }

  return (
    <div className="results-table">
      <div className="results-table__toolbar">
        <input
          type="text"
          className="results-table__filter"
          placeholder="Filter by name or city"
          value={filterText}
          onChange={(event) => setFilterText(event.target.value)}
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
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 8 }).map((_, index) => (
                  <tr className="skeleton-row" key={`skeleton-${index}`}>
                    {COLUMNS.map((column) => (
                      <td key={column.key}>
                        <span className="skeleton-block" />
                      </td>
                    ))}
                  </tr>
                ))
              : sorted.map((org) => (
                  <tr
                    key={org.id}
                    className={org.id === selectedId ? 'is-selected' : ''}
                    onClick={() => onSelectRow && onSelectRow(org.id)}
                  >
                    <td title={org.name || ''} className="truncate">
                      {org.name || 'Unnamed organization'}
                      {org.isSynthetic ? <span className="badge badge--synthetic">Demo</span> : null}
                    </td>
                    <td title={ORG_TYPE_LABELS[org.orgType] || org.orgType || ''} className="truncate">
                      {ORG_TYPE_LABELS[org.orgType] || org.orgType || '—'}
                    </td>
                    <td className="align-right">
                      {typeof org.distanceMiles === 'number' ? `${org.distanceMiles.toFixed(1)} mi` : '—'}
                    </td>
                    <td title={org.address?.city || ''} className="truncate">
                      {org.address?.city || '—'}
                    </td>
                    <td title={org.phone || ''} className="truncate">
                      {org.phone || '—'}
                    </td>
                    <td title={org.website || ''} className="truncate">
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
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

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
