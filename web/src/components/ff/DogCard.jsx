// One dog card. The whole card is a link out to the dog's page on its own
// shelter's site — that hand-off IS the product, so there is no internal
// detail view to compete with it.

import { Icon, ICONS, PawIcon } from './FFHeader.jsx';

const AGE_LABEL = { baby: 'Puppy', young: 'Young', adult: 'Adult', senior: 'Senior' };
const SIZE_LABEL = { small: 'Small', medium: 'Medium', large: 'Large', xlarge: 'XL' };
const NEW_WINDOW_DAYS = 7;

export function breedLine(dog) {
  if (dog.breedPrimary && dog.breedSecondary) return `${dog.breedPrimary} × ${dog.breedSecondary} mix`;
  if (dog.breedPrimary) return dog.breedPrimary + (dog.isMix ? ' mix' : '');
  return 'Mixed breed';
}

export function statLine(dog) {
  const bits = [];
  const age = [AGE_LABEL[dog.ageGroup]].filter(Boolean);
  if (dog.ageMonths != null) {
    age.push(dog.ageMonths >= 24 ? `${Math.round(dog.ageMonths / 12)} yr` : `${dog.ageMonths} mo`);
  }
  if (age.length) bits.push(age.join(' · '));
  if (dog.sex === 'female') bits.push('Female');
  else if (dog.sex === 'male') bits.push('Male');
  if (dog.sizeGroup) bits.push(SIZE_LABEL[dog.sizeGroup] + (dog.weightLbs ? ` · ${dog.weightLbs} lbs` : ''));
  return bits.join(' · ');
}

export function isNewThisWeek(dog) {
  if (!dog.firstSeenAt) return false;
  return Date.now() - Date.parse(dog.firstSeenAt) <= NEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Tri-state attribute badge. Unknown gets its own dashed "?" treatment —
 * never omitted, never styled like "no". A shelter that didn't assess a dog
 * has not said the dog is bad with kids, and the card must not imply it.
 */
function Badge({ label, value }) {
  if (value === true) {
    return <span className="ff-bdg ff-bdg--yes" title={`Good with ${label.toLowerCase()}: yes`}>{label} ✓</span>;
  }
  if (value === false) {
    return <span className="ff-bdg ff-bdg--no" title={`Good with ${label.toLowerCase()}: no`}>{label} ✕</span>;
  }
  return (
    <span className="ff-bdg ff-bdg--unk" title={`Good with ${label.toLowerCase()}: not yet assessed — ask the shelter`}>
      {label} ?
    </span>
  );
}

export default function DogCard({ dog, saved, onToggleSave }) {
  const photo = dog.photos?.[0]?.url ?? null;

  function handleHeart(event) {
    // The card is an anchor — the heart must not follow it.
    event.preventDefault();
    event.stopPropagation();
    onToggleSave(dog);
  }

  return (
    <a
      className="ff-card"
      href={dog.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      title="Opens this dog's page on the shelter's own site"
    >
      <div className="ff-card__ph">
        {photo ? (
          <img src={photo} alt={dog.name} loading="lazy"
            onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        ) : (
          <div className="ff-nophoto">
            <div className="ff-disc"><PawIcon /></div>
            <span>No photo yet — worth a call</span>
          </div>
        )}
        <div className="ff-card__flags">
          {isNewThisWeek(dog) ? <span className="ff-flag ff-flag--new">New this week</span> : null}
          {dog.status === 'pending' ? <span className="ff-flag ff-flag--pending">Pending</span> : null}
        </div>
        <button
          type="button"
          className={`ff-heart${saved ? ' saved' : ''}`}
          onClick={handleHeart}
          aria-label={saved ? `Remove ${dog.name} from saved dogs` : `Save ${dog.name}`}
          aria-pressed={saved}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'}
            stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
            <path d={ICONS.heart[0]} />
          </svg>
        </button>
      </div>
      <div className="ff-card__body">
        <div className="ff-card__name">
          <span className="nm">{dog.name}</span>
          <Icon d={ICONS.external} size={16} stroke="var(--ff-accent)" style={{ flexShrink: 0, opacity: 0.7 }} />
        </div>
        <div className="ff-card__breed">{breedLine(dog)}</div>
        <div className="ff-card__stats">{statLine(dog)}</div>
        {dog.description ? <p className="ff-card__desc">{dog.description}</p> : null}
        <div className="ff-badges">
          <Badge label="Kids" value={dog.attributes?.goodWithKids ?? null} />
          <Badge label="Dogs" value={dog.attributes?.goodWithDogs ?? null} />
          <Badge label="Cats" value={dog.attributes?.goodWithCats ?? null} />
          {dog.attributes?.houseTrained === true ? (
            <span className="ff-bdg ff-bdg--yes" title="House-trained">House-trained</span>
          ) : null}
          {dog.attributes?.specialNeeds === true ? (
            <span className="ff-bdg ff-bdg--sn" title="Has special needs — see the shelter's page">Special needs</span>
          ) : null}
        </div>
        <div className="ff-card__meta">
          <strong>{dog.orgName}</strong>
          {dog.distanceMiles != null ? <> · {dog.distanceMiles.toFixed(1)} mi</> : null}
        </div>
      </div>
    </a>
  );
}
