// Log in — 440px card over the design's easter egg: ten dog-face bubbles
// bouncing DVD-screensaver style behind the card.
//
// The bubbles animate via refs + one requestAnimationFrame loop writing
// transforms directly — never React state, which would re-render the whole
// page 60 times a second. They're clamped below the header band, sit behind
// the card (z-index), and take no pointer events.

import { useEffect, useRef, useState } from 'react';
import FFHeader from '../components/ff/FFHeader.jsx';
import { login, mergeAnonymousSaves } from '../api.js';
import { useAuth, navigate } from '../App.jsx';
import logo from '../assets/ff/logo.jpg';

import b1 from '../assets/ff/dvd-dog-1.png';
import b2 from '../assets/ff/dvd-dog-2.png';
import b3 from '../assets/ff/dvd-dog-3.png';
import b4 from '../assets/ff/dvd-dog-4.png';
import b5 from '../assets/ff/dvd-dog-5.png';
import b6 from '../assets/ff/dvd-dog-6.png';
import b7 from '../assets/ff/dvd-dog-7.png';
import b8 from '../assets/ff/dvd-dog-8.png';
import b9 from '../assets/ff/dvd-dog-9.png';
import b10 from '../assets/ff/dvd-dog-10.png';

const BUBBLES = [b1, b2, b3, b4, b5, b6, b7, b8, b9, b10];
const BUBBLE_SIZE = 120;
const MIN_SPEED = 7.5;
const MAX_SPEED = 10;

function DogBubbles() {
  const wrapRef = useRef(null);
  const nodesRef = useRef([]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;

    // Deterministic-ish spread: stagger starts across the area, randomize
    // direction. Speeds land in the design's 7.5–10 px/frame band.
    const dogs = BUBBLES.map((_, i) => {
      const angle = (i / BUBBLES.length) * Math.PI * 2 + Math.random() * 0.8;
      const speed = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
      return {
        x: (i % 5) * 0.19 * Math.max(0, wrap.clientWidth - BUBBLE_SIZE) + 10,
        y: Math.floor(i / 5) * 0.4 * Math.max(0, wrap.clientHeight - BUBBLE_SIZE) + 10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
      };
    });

    let raf;
    const tick = () => {
      const maxX = wrap.clientWidth - BUBBLE_SIZE;
      const maxY = wrap.clientHeight - BUBBLE_SIZE;
      dogs.forEach((d, i) => {
        d.x += d.vx;
        d.y += d.vy;
        if (d.x <= 0) { d.x = 0; d.vx = Math.abs(d.vx); }
        if (d.x >= maxX) { d.x = maxX; d.vx = -Math.abs(d.vx); }
        if (d.y <= 0) { d.y = 0; d.vy = Math.abs(d.vy); }
        if (d.y >= maxY) { d.y = maxY; d.vy = -Math.abs(d.vy); }
        const node = nodesRef.current[i];
        if (node) node.style.transform = `translate(${d.x}px, ${d.y}px)`;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="ff-bubbles" ref={wrapRef} aria-hidden="true">
      {BUBBLES.map((src, i) => (
        <img key={i} className="ff-bubble" src={src} alt=""
          ref={(el) => { nodesRef.current[i] = el; }} />
      ))}
    </div>
  );
}

export default function LoginPage() {
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      // Hearts collected while signed out follow the user into the account.
      try { await mergeAnonymousSaves(); } catch { /* stays local for next time */ }
      await refresh();
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="ff-page">
      <FFHeader />
      <div className="ff-login-wrap">
        <DogBubbles />
        <div className="ff-login-card">
          <img className="logo" src={logo} alt="" />
          <h1>Welcome back</h1>
          <form onSubmit={handleSubmit}>
            <input className="ff-input" type="email" placeholder="Email" value={email}
              onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus />
            <input className="ff-input" type="password" placeholder="Password" value={password}
              onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            {error ? <div className="ff-error" role="alert">{error}</div> : null}
            <button className="ff-btn ff-btn--primary" type="submit" disabled={submitting} style={{ width: '100%' }}>
              {submitting ? 'Logging in…' : 'Log in'}
            </button>
          </form>
          <div className="links">
            <a href="#/login" onClick={(e) => e.preventDefault()} title="Not built yet — this is a demo">Forgot password?</a>
            <div style={{ marginTop: 8 }}>New here? <a href="#/signup">Become a foster</a></div>
          </div>
        </div>
      </div>
    </div>
  );
}
