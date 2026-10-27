import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import AuthLayout from '../components/AuthLayout.jsx';
import { Alert, Field, StrengthMeter, useSubmit } from '../components/Form.jsx';

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [done, setDone] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const { submit, loading, error, fields } = useSubmit(async () => {
    const r = await api.post('/auth/register', form, { auth: false });
    setDone(r);
  });

  if (done) {
    return (
      <AuthLayout
        title={done.autoVerified ? 'Account created' : 'Check your inbox'}
        footer={<Link to="/login">{done.autoVerified ? 'Log in' : 'Back to log in'}</Link>}
      >
        <Alert kind="success">{done.message}</Alert>
        {!done.autoVerified && (
          <p className="muted">Open the link in the email to activate your account. It expires in 24 hours.</p>
        )}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Use a password you don't use anywhere else."
      footer={<>Already registered? <Link to="/login">Log in</Link></>}
    >
      <form onSubmit={submit} noValidate>
        <Alert>{error}</Alert>
        <Field label="Name" autoComplete="name" value={form.name} onChange={set('name')} error={fields.name} required />
        <Field label="Email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={fields.email} required />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={set('password')}
          error={fields.password}
          hint="At least 10 characters, with a letter and a number."
          required
        />
        <StrengthMeter password={form.password} />
        <button className="btn" disabled={loading}>{loading ? 'Creating account…' : 'Create account'}</button>
      </form>
    </AuthLayout>
  );
}
