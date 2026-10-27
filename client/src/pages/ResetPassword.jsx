import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import AuthLayout from '../components/AuthLayout.jsx';
import { Alert, Field, StrengthMeter, useSubmit } from '../components/Form.jsx';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const token = params.get('token') || '';

  const { submit, loading, error, fields } = useSubmit(async () => {
    const r = await api.post('/auth/reset-password', { token, password }, { auth: false });
    navigate('/login', { state: { notice: r.message } });
  });

  return (
    <AuthLayout title="Choose a new password" footer={<Link to="/login">Back to log in</Link>}>
      {!token ? (
        <Alert>This link is missing its token. Request a new one from the forgot password page.</Alert>
      ) : (
        <form onSubmit={submit} noValidate>
          <Alert>{error}</Alert>
          <Field
            label="New password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fields.password}
            hint="At least 10 characters, with a letter and a number."
            required
          />
          <StrengthMeter password={password} />
          <button className="btn" disabled={loading}>{loading ? 'Saving…' : 'Save new password'}</button>
        </form>
      )}
    </AuthLayout>
  );
}
