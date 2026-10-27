import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { api } from '../api.js';
import AuthLayout from '../components/AuthLayout.jsx';
import { Alert, Field, useSubmit } from '../components/Form.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [resent, setResent] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const { submit, loading, error, fields, code } = useSubmit(async () => {
    await login(form.email, form.password);
    navigate(location.state?.from || '/', { replace: true });
  });

  const resend = async () => {
    const r = await api.post('/auth/resend-verification', { email: form.email }, { auth: false });
    setResent(r.message);
  };

  return (
    <AuthLayout
      title="Log in"
      subtitle="Welcome back."
      footer={<>New here? <Link to="/register">Create an account</Link></>}
    >
      <form onSubmit={submit} noValidate>
        <Alert kind="success">{location.state?.notice}</Alert>
        <Alert>{error}</Alert>
        {code === 'EMAIL_NOT_VERIFIED' && (
          <p className="muted small">
            Didn't get the email? <button type="button" className="link" onClick={resend}>Send a new link</button>
          </p>
        )}
        <Alert kind="success">{resent}</Alert>
        <Field label="Email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={fields.email} required />
        <Field label="Password" type="password" autoComplete="current-password" value={form.password} onChange={set('password')} error={fields.password} required />
        <p className="small right"><Link to="/forgot-password">Forgot password?</Link></p>
        <button className="btn" disabled={loading}>{loading ? 'Logging in…' : 'Log in'}</button>
      </form>
    </AuthLayout>
  );
}
