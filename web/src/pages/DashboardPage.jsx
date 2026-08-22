// Foster dashboard — greeting, current placement, to-dos, journal, saved
// dogs. All data through /api/me/*; App.jsx guarantees a signed-in user
// before rendering this page.

import { useEffect, useRef, useState } from 'react';
import FFHeader, { PawIcon } from '../components/ff/FFHeader.jsx';
import {
  getPlacement, getSaved, getTodos, getUpdates,
  addTodo, patchTodo, deleteTodo, postUpdate, unsaveDog,
} from '../api.js';
import { useAuth } from '../App.jsx';

const MOODS = [
  ['great', 'Doing great'],
  ['settling', 'Settling in'],
  ['hiccups', 'A few hiccups'],
  ['help', 'Needs help'],
];
const MOOD_LABEL = Object.fromEntries(MOODS);
const CHECK_REMOVE_DELAY_MS = 220; // design: checking a to-do removes it a beat later
const PHOTO_MAX_EDGE = 600;

function daysSince(iso) {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  return Math.max(1, days + 1); // day of arrival is "Day 1"
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Downscales an image file to a small JPEG data URL so the store stays small. */
function resizeToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}

function PhotoSlot({ photo, onFile }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  function handleDrop(e) {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files?.[0];
    if (file?.type.startsWith('image/')) onFile(file);
  }

  return (
    <div
      className={`ff-photo-slot${drag ? ' drag' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') inputRef.current?.click(); }}
      aria-label="Add a photo"
    >
      {photo ? <img src={photo} alt="Foster dog" /> : <span>Drop a photo<br />or click to add</span>}
      <input
        ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }}
      />
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const firstName = user?.profile?.firstName || 'there';

  const [placement, setPlacementState] = useState(null);
  const [todos, setTodos] = useState([]);
  const [updates, setUpdates] = useState([]);
  const [saved, setSaved] = useState([]);
  const [leaving, setLeaving] = useState(() => new Set());

  const [newTodo, setNewTodo] = useState('');
  const [mood, setMood] = useState(null);
  const [entryText, setEntryText] = useState('');
  const [photos, setPhotos] = useState([null, null, null]);
  const [journalError, setJournalError] = useState(null);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    getPlacement().then(setPlacementState).catch(() => {});
    getTodos().then(setTodos).catch(() => {});
    getUpdates().then(setUpdates).catch(() => {});
    getSaved().then(setSaved).catch(() => {});
  }, []);

  // ── To-dos ──
  async function handleAddTodo(e) {
    e.preventDefault();
    const text = newTodo.trim();
    if (!text) return;
    setNewTodo('');
    setTodos(await addTodo(text).catch(() => todos));
  }

  function handleCheck(todo) {
    // Per the design: checking marks it done, then it leaves the list a
    // moment later — the pause is the satisfying part.
    setLeaving((prev) => new Set(prev).add(todo.id));
    patchTodo(todo.id, { done: true }).catch(() => {});
    setTimeout(async () => {
      const next = await deleteTodo(todo.id).catch(() => null);
      if (next) setTodos(next);
      setLeaving((prev) => { const s = new Set(prev); s.delete(todo.id); return s; });
    }, CHECK_REMOVE_DELAY_MS);
  }

  // ── Journal ──
  async function handlePost() {
    const text = entryText.trim();
    if (!mood && !text) { setJournalError('Pick a mood, write a line, or both.'); return; }
    setJournalError(null);
    setPosting(true);
    try {
      const next = await postUpdate({ mood, text, photos: photos.filter(Boolean) });
      setUpdates(next);
      setMood(null); setEntryText(''); setPhotos([null, null, null]);
    } catch (err) {
      setJournalError(err.message);
    } finally {
      setPosting(false);
    }
  }

  async function handlePhoto(index, file) {
    try {
      const dataUrl = await resizeToDataUrl(file);
      setPhotos((prev) => prev.map((p, i) => (i === index ? dataUrl : p)));
    } catch (err) {
      setJournalError(err.message);
    }
  }

  async function handleUnsave(e, dog) {
    e.preventDefault();
    setSaved(await unsaveDog(dog.id).catch(() => saved));
  }

  return (
    <div className="ff-page">
      <FFHeader />
      <main className="ff-dash">
        <div>
          <h1>Hi {firstName} 👋</h1>
          <p className="status-line">
            Your foster profile is complete — shelters can see you're open to{' '}
            {(user?.profile?.fosterSizes ?? []).length ? user.profile.fosterSizes.join(', ') + ' dogs' : 'fostering'}.
          </p>
        </div>

        <div className="ff-dash__row">
          <section className="ff-panel">
            <h2>Currently fostering</h2>
            {placement ? (
              <div className="ff-foster-card">
                <div className="ph">
                  {placement.photo
                    ? <img src={placement.photo} alt={placement.dogName} />
                    : <div className="ff-nophoto" style={{ height: '100%' }}><div className="ff-disc"><PawIcon /></div></div>}
                </div>
                <div>
                  <div className="nm">{placement.dogName}</div>
                  {placement.breedLine ? <div style={{ fontSize: 14, color: 'var(--ff-text-soft)' }}>{placement.breedLine}</div> : null}
                  {placement.orgName ? (
                    <div style={{ fontSize: 13.5, marginTop: 6 }}>
                      From <strong>{placement.orgName}</strong>
                      {placement.fosterToAdopt ? ' · foster-to-adopt' : ''}
                    </div>
                  ) : null}
                  <span className="ff-day-badge">Day {daysSince(placement.startedAt)}</span>
                  <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                    <button className="ff-btn ff-btn--outline" title="Coming soon" disabled>Message shelter</button>
                    <a className="ff-btn ff-btn--primary" href="#journal"
                      onClick={(e) => { e.preventDefault(); document.getElementById('ff-journal')?.scrollIntoView({ behavior: 'smooth' }); }}>
                      Log an update
                    </a>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: 14.5, color: 'var(--ff-text-soft)', margin: '0 0 14px', lineHeight: 1.5 }}>
                  No foster dog at the moment. When a shelter places one with you, they'll show up here.
                </p>
                <a className="ff-btn ff-btn--primary" href="#/dogs">Browse dogs who need a foster</a>
              </div>
            )}
          </section>

          <section className="ff-panel">
            <h2>To-do</h2>
            {todos.length ? (
              <ul className="ff-todo-list">
                {todos.map((todo) => (
                  <li key={todo.id} className={leaving.has(todo.id) ? 'leaving' : ''}>
                    <input
                      type="checkbox" checked={todo.done || leaving.has(todo.id)}
                      onChange={() => handleCheck(todo)} aria-label={`Done: ${todo.text}`}
                    />
                    <span>{todo.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ff-hint" style={{ margin: '0 0 14px' }}>
                Nothing on the list. Add prep like "buy a crate" or "puppy-proof the cords".
              </p>
            )}
            <form className="ff-todo-add" onSubmit={handleAddTodo}>
              <input className="ff-input" style={{ fontSize: 14.5, padding: '10px 16px' }} type="text"
                placeholder="Add a to-do" value={newTodo} onChange={(e) => setNewTodo(e.target.value)} />
              <button className="ff-btn ff-btn--outline" type="submit">Add</button>
            </form>
          </section>
        </div>

        <section className="ff-panel" id="ff-journal">
          <h2>Foster journal</h2>
          <div className="ff-mood-chips">
            {MOODS.map(([value, label]) => (
              <button key={value} type="button" className={`ff-chip${mood === value ? ' on' : ''}`}
                aria-pressed={mood === value} onClick={() => setMood(mood === value ? null : value)}>
                {label}
              </button>
            ))}
          </div>
          <textarea
            className="ff-textarea" placeholder="How's it going? Shelters love these notes — they become the dog's adoption story."
            value={entryText} onChange={(e) => setEntryText(e.target.value)}
          />
          {journalError ? <div className="ff-error" role="alert">{journalError}</div> : null}
          <div style={{ marginTop: 12 }}>
            <button className="ff-btn ff-btn--primary" onClick={handlePost} disabled={posting}>
              {posting ? 'Posting…' : 'Post update'}
            </button>
          </div>

          <div className="ff-photo-slots">
            {photos.map((photo, i) => (
              <PhotoSlot key={i} photo={photo} onFile={(file) => handlePhoto(i, file)} />
            ))}
          </div>

          {updates.length ? (
            <div className="ff-journal-entries">
              {updates.map((entry) => (
                <div className="ff-entry" key={entry.id}>
                  <div className="head">
                    {entry.mood ? <span className="mood">{MOOD_LABEL[entry.mood] ?? entry.mood}</span> : null}
                    <span className="date">{formatDate(entry.createdAt)}</span>
                  </div>
                  {entry.text ? <p>{entry.text}</p> : null}
                  {entry.photos?.length ? (
                    <div className="photos">
                      {entry.photos.map((src, i) => <img key={i} src={src} alt="" />)}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="ff-panel">
          <h2>Saved dogs</h2>
          {saved.length ? (
            <div className="ff-saved-rows">
              {saved.map((dog) => (
                <a className="ff-saved-row" key={dog.id} href={dog.sourceUrl ?? '#/dogs'}
                  target={dog.sourceUrl ? '_blank' : undefined} rel="noopener noreferrer">
                  <div className="ph">
                    {dog.photo
                      ? <img src={dog.photo} alt="" />
                      : <PawIcon size={22} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="nm">{dog.name}</div>
                    <div className="meta">{[dog.breedLine, dog.meta, dog.orgName].filter(Boolean).join(' · ')}</div>
                  </div>
                  <button className="ff-btn ff-btn--ghost" onClick={(e) => handleUnsave(e, dog)}>Remove</button>
                </a>
              ))}
            </div>
          ) : (
            <p className="ff-hint" style={{ margin: 0 }}>
              Nothing saved yet — tap the heart on any dog in <a href="#/dogs">the grid</a> and they'll wait for you here.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
