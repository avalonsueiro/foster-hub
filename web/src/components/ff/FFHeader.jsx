// The tan header band shared by every Foster Fetch page. Signed out it shows
// the design's Log in / Become a foster pills; signed in it swaps to the
// user's first name (→ dashboard) and a log-out ghost button.

import { useAuth, navigate } from '../../App.jsx';
import logo from '../../assets/ff/logo.jpg';

export default function FFHeader() {
  const { user, signOut } = useAuth();

  return (
    <header className="ff-header">
      <div className="ff-header__inner">
        <a className="ff-brand" href="#/dogs">
          <img src={logo} alt="Foster Fetch logo" />
          <span>Foster Fetch</span>
        </a>
        <nav className="ff-header__nav">
          {user ? (
            <>
              <a className="ff-btn ff-btn--outline" href="#/dashboard">
                {user.profile?.firstName || 'Dashboard'}
              </a>
              <button className="ff-btn ff-btn--ghost" onClick={signOut}>
                Log out
              </button>
            </>
          ) : (
            <>
              <a className="ff-btn ff-btn--outline" href="#/login">Log in</a>
              <a className="ff-btn ff-btn--primary" href="#/signup">Become a foster</a>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

/** Small Lucide-style icons used across FF pages (stroke-width 2.75 per the design). */
export function Icon({ d, size = 16, stroke = 'currentColor', style }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={stroke} strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round"
      style={style} aria-hidden="true"
    >
      {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
    </svg>
  );
}

export const ICONS = {
  mapPin: ['M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0', 'M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6'],
  external: ['M15 3h6v6', 'M10 14 21 3', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'],
  heart: ['M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'],
  info: ['M12 16v-4', 'M12 8h.01'],
  check: ['M20 6 9 17l-5-5'],
};

export function PawIcon({ size = 26, color = 'var(--ff-green-700)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="4" r="2" /><circle cx="18" cy="8" r="2" /><circle cx="20" cy="16" r="2" />
      <path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z" />
    </svg>
  );
}
