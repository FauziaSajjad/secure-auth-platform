import { useState } from 'react';

export function Field({ label, error, hint, ...props }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input aria-invalid={!!error} {...props} />
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export const Alert = ({ kind = 'error', children }) =>
  children ? <p className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</p> : null;

// Wraps a submit handler with loading state, a top-level error, and per-field errors from the API.
export function useSubmit(fn) {
  const [state, setState] = useState({ loading: false, error: '', fields: {}, code: '' });
  const submit = async (e) => {
    e.preventDefault();
    setState({ loading: true, error: '', fields: {}, code: '' });
    try {
      await fn();
      setState((s) => ({ ...s, loading: false }));
    } catch (err) {
      const fields = {};
      (err.details || []).forEach((d) => (fields[d.field] = d.message));
      setState({ loading: false, error: err.details?.length ? '' : err.message, fields, code: err.code || '' });
    }
  };
  return { ...state, submit };
}

// 0-4 score: length, extra length, mixed case, symbol
export function passwordScore(pw) {
  let s = 0;
  if (pw.length >= 10) s++;
  if (pw.length >= 14) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

export function StrengthMeter({ password }) {
  if (!password) return null;
  const score = passwordScore(password);
  const labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];
  return (
    <div className="meter" aria-live="polite">
      <div className="meter-bars">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={n <= score ? `on s${score}` : ''} />
        ))}
      </div>
      <span>{labels[score]}</span>
    </div>
  );
}
