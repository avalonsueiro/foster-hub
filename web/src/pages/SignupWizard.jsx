// Become a foster — 9-step wizard, one question per screen. Answers live in
// one controlled `form` object so Back always preserves them; Enter advances.
// Conditional branches per the design: renters get the landlord question,
// current-pet owners get the spay/vaccine confirmations.

import { useEffect, useRef, useState } from 'react';
import FFHeader from '../components/ff/FFHeader.jsx';
import { signup } from '../api.js';
import { useAuth, navigate } from '../App.jsx';

const TOTAL_STEPS = 9;

const INITIAL = {
  firstName: '', lastName: '', email: '', zip: '',
  homeType: '', household: [],
  rentOwn: '', landlordOk: '', outdoorSpace: '',
  hasPets: null, petsSpayed: false, petsVaccinated: false,
  fosterSizes: [], openTo: [], duration: '', vetTransport: '',
  password: '',
};

const HOME_TYPES = [['house', 'House'], ['apartment', 'Apartment'], ['other', 'Other']];
const HOUSEHOLD = [['kidsUnder10', 'Kids under 10'], ['kids10plus', 'Kids 10+'], ['otherDogs', 'Other dogs'], ['cats', 'Cats'], ['adultsOnly', 'Just me / adults']];
const RENT_OWN = [['rent', 'Rent'], ['own', 'Own']];
const LANDLORD = [['yes', 'Yes'], ['notSure', 'Not sure']];
const OUTDOOR = [['fenced', 'Fenced yard'], ['unfenced', 'Unfenced yard'], ['none', 'No yard']];
const SIZES = [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large'], ['xlarge', 'XL']];
const OPEN_TO = [['puppies', 'Puppies'], ['seniors', 'Seniors'], ['medical', 'Medical recovery'], ['shy', 'Shy / decompression'], ['emergency', 'Short-notice emergencies']];
const DURATION = [['weekend', 'A weekend'], ['2-4w', '2–4 weeks'], ['2m+', '2+ months']];
const TRANSPORT = [['yes', 'Yes'], ['sometimes', 'Sometimes'], ['no', 'No']];

function Chips({ defs, isOn, onToggle }) {
  return (
    <div className="ff-chips">
      {defs.map(([value, label]) => (
        <button key={value} type="button" className={`ff-chip${isOn(value) ? ' on' : ''}`}
          aria-pressed={isOn(value)} onClick={() => onToggle(value)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export default function SignupWizard() {
  const { refresh } = useAuth();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(INITIAL);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, [step]);

  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));
  const toggleList = (field) => (value) =>
    setForm((f) => ({
      ...f,
      [field]: f[field].includes(value) ? f[field].filter((v) => v !== value) : [...f[field], value],
    }));

  function validate() {
    switch (step) {
      case 1: return form.firstName.trim() ? null : 'Your first name is required.';
      case 2: return form.lastName.trim() ? null : 'Your last name is required.';
      case 3: return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) ? null : 'That email doesn’t look right.';
      case 4: return /^\d{5}(-\d{4})?$/.test(form.zip.trim()) ? null : 'A 5-digit zip code is required.';
      case 5: return form.homeType ? null : 'Pick the option closest to your home.';
      case 6: {
        if (!form.rentOwn) return 'Rent or own?';
        if (form.rentOwn === 'rent' && !form.landlordOk) return 'Let us know about your landlord.';
        return form.outdoorSpace ? null : 'Tell us about your outdoor space.';
      }
      case 7: return form.hasPets === null ? 'Do you have pets at home now?' : null;
      case 8: return form.duration ? null : 'How long could a foster stay?';
      case 9: return form.password.length >= 8 ? null : 'Password must be at least 8 characters.';
      default: return null;
    }
  }

  async function next() {
    const problem = validate();
    if (problem) { setError(problem); return; }
    setError(null);
    if (step < TOTAL_STEPS) { setStep(step + 1); return; }

    setSubmitting(true);
    try {
      // hasPets:null never reaches here (validated), and the confirmations
      // only mean something when there are pets to confirm.
      const payload = {
        ...form,
        email: form.email.trim().toLowerCase(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        zip: form.zip.trim(),
        petsSpayed: form.hasPets ? form.petsSpayed : null,
        petsVaccinated: form.hasPets ? form.petsVaccinated : null,
        landlordOk: form.rentOwn === 'rent' ? form.landlordOk : null,
      };
      await signup(payload);
      await refresh();
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function back() {
    setError(null);
    if (step > 1) setStep(step - 1);
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); next(); }
  }

  if (done) {
    return (
      <div className="ff-page">
        <FFHeader />
        <main className="ff-wizard">
          <div className="ff-wcard" style={{ textAlign: 'center' }}>
            <div className="ff-disc" style={{ width: 64, height: 64, margin: '0 auto 18px', background: 'var(--ff-green-200)' }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--ff-green-800)"
                strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            </div>
            <h2>You're in, {form.firstName.trim()}!</h2>
            <p className="sub">
              Your foster profile is saved. Shelters you apply with will still run their own quick approval.
            </p>
            <div className="ff-wizard__nav" style={{ justifyContent: 'center' }}>
              <button className="ff-btn ff-btn--primary" onClick={() => navigate('/dashboard')}>Go to my dashboard</button>
              <button className="ff-btn ff-btn--outline" onClick={() => navigate('/dogs')}>Browse dogs</button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const questions = {
    1: (
      <>
        <h2>First things first — what's your first name?</h2>
        <input ref={inputRef} className="ff-input" type="text" placeholder="First name"
          value={form.firstName} onChange={(e) => set('firstName')(e.target.value)} autoComplete="given-name" />
      </>
    ),
    2: (
      <>
        <h2>And your last name?</h2>
        <input ref={inputRef} className="ff-input" type="text" placeholder="Last name"
          value={form.lastName} onChange={(e) => set('lastName')(e.target.value)} autoComplete="family-name" />
      </>
    ),
    3: (
      <>
        <h2>What's your email?</h2>
        <p className="sub">This will also be your login.</p>
        <input ref={inputRef} className="ff-input" type="email" placeholder="you@example.com"
          value={form.email} onChange={(e) => set('email')(e.target.value)} autoComplete="email" />
      </>
    ),
    4: (
      <>
        <h2>What's your zip code?</h2>
        <p className="sub">So we can match you with shelters nearby.</p>
        <input ref={inputRef} className="ff-input" type="text" inputMode="numeric" placeholder="94103"
          value={form.zip} onChange={(e) => set('zip')(e.target.value)} autoComplete="postal-code" />
      </>
    ),
    5: (
      <>
        <h2>Tell us about your home</h2>
        <div className="ff-group">
          <span className="lbl">Home type</span>
          <Chips defs={HOME_TYPES} isOn={(v) => form.homeType === v} onToggle={set('homeType')} />
        </div>
        <div className="ff-group">
          <span className="lbl">Who's at home?</span>
          <Chips defs={HOUSEHOLD} isOn={(v) => form.household.includes(v)} onToggle={toggleList('household')} />
        </div>
      </>
    ),
    6: (
      <>
        <h2>Your space</h2>
        <div className="ff-group">
          <span className="lbl">Do you rent or own?</span>
          <Chips defs={RENT_OWN} isOn={(v) => form.rentOwn === v} onToggle={set('rentOwn')} />
        </div>
        {form.rentOwn === 'rent' ? (
          <div className="ff-group">
            <span className="lbl">Does your landlord allow dogs?</span>
            <Chips defs={LANDLORD} isOn={(v) => form.landlordOk === v} onToggle={set('landlordOk')} />
          </div>
        ) : null}
        <div className="ff-group">
          <span className="lbl">Outdoor space</span>
          <Chips defs={OUTDOOR} isOn={(v) => form.outdoorSpace === v} onToggle={set('outdoorSpace')} />
        </div>
      </>
    ),
    7: (
      <>
        <h2>Any pets at home right now?</h2>
        <Chips
          defs={[['yes', 'Yes'], ['no', 'No']]}
          isOn={(v) => form.hasPets === (v === 'yes')}
          onToggle={(v) => set('hasPets')(v === 'yes')}
        />
        {form.hasPets ? (
          <div className="ff-group">
            <span className="lbl">A couple of quick confirmations</span>
            <Chips
              defs={[['petsSpayed', 'They’re spayed / neutered'], ['petsVaccinated', 'They’re up to date on vaccines']]}
              isOn={(v) => form[v] === true}
              onToggle={(v) => setForm((f) => ({ ...f, [v]: !f[v] }))}
            />
          </div>
        ) : null}
      </>
    ),
    8: (
      <>
        <h2>What could fostering look like for you?</h2>
        <div className="ff-group">
          <span className="lbl">Sizes you could host</span>
          <Chips defs={SIZES} isOn={(v) => form.fosterSizes.includes(v)} onToggle={toggleList('fosterSizes')} />
        </div>
        <div className="ff-group">
          <span className="lbl">Open to</span>
          <Chips defs={OPEN_TO} isOn={(v) => form.openTo.includes(v)} onToggle={toggleList('openTo')} />
        </div>
        <div className="ff-group">
          <span className="lbl">How long could a foster stay?</span>
          <Chips defs={DURATION} isOn={(v) => form.duration === v} onToggle={set('duration')} />
        </div>
        <div className="ff-group">
          <span className="lbl">Could you drive to vet appointments?</span>
          <Chips defs={TRANSPORT} isOn={(v) => form.vetTransport === v} onToggle={set('vetTransport')} />
        </div>
      </>
    ),
    9: (
      <>
        <h2>Last step — create a password</h2>
        <p className="sub">At least 8 characters. This is a demo build — please don't reuse a password from another site.</p>
        <input ref={inputRef} className="ff-input" type="password" placeholder="Password"
          value={form.password} onChange={(e) => set('password')(e.target.value)} autoComplete="new-password" />
      </>
    ),
  };

  return (
    <div className="ff-page">
      <FFHeader />
      <main className="ff-wizard" onKeyDown={onKeyDown}>
        <div className="ff-progress" role="progressbar" aria-valuemin={1} aria-valuemax={TOTAL_STEPS} aria-valuenow={step}>
          <div className="fill" style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
        </div>
        <div className="ff-kicker">Step {step} of {TOTAL_STEPS}</div>

        <div className="ff-wcard">
          {questions[step]}
          {error ? <div className="ff-error" role="alert">{error}</div> : null}
          <div className="ff-wizard__nav">
            <button className="ff-btn ff-btn--primary" onClick={next} disabled={submitting}>
              {submitting ? 'Signing up…' : step === TOTAL_STEPS ? 'Sign me up' : 'Continue'}
            </button>
            {step > 1 ? <button className="ff-btn ff-btn--ghost" onClick={back}>Back</button> : null}
          </div>
        </div>

        <p className="ff-wizard__note">
          By signing up you confirm you're 18 or older. Each shelter still runs its own quick approval —
          this profile just means you never fill out the same form twice.
        </p>
      </main>
    </div>
  );
}
