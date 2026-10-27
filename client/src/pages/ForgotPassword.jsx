import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import AuthLayout from '../components/AuthLayout.jsx';
import { Alert, Field, useSubmit } from '../components/Form.jsx';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState('');
  const { submit, loading, error, fields } = useSubmit(async () => {
    const r = await api.post('/auth/forgot-password', { email }, { auth: false });
    setDone(r.message);
  });

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your email and we'll send a reset link."
      footer={<Link to="/login">Back to log in</Link>}
    >
      {done ? (
        <Alert kind="success">{done}</Alert>
      ) : (
        <form onSubmit={submit} noValidate>
          <Alert>{error}</Alert>
          <Field label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fields.email} required />
          <button className="btn" disabled={loading}>{loading ? 'Sending…' : 'Send reset link'}</button>
        </form>
      )}
    </AuthLayout>
  );
}
