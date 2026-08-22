/**
 * Reusable empty state: an icon-ish glyph, a title, an explanation of what
 * would appear here, and an optional action to make it appear.
 */
export default function EmptyState({ title, description, actionLabel, onAction, glyph = '📍' }) {
  return (
    <div className="empty-state">
      <div className="empty-state__glyph" aria-hidden="true">
        {glyph}
      </div>
      <p className="empty-state__title">{title}</p>
      {description ? <p className="empty-state__description">{description}</p> : null}
      {actionLabel && onAction ? (
        <button type="button" className="button button--secondary" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
