import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import AuthLayout from '../components/AuthLayout.jsx';
import { Alert } from '../components/Form.jsx';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState({ state: 'loading', message: '' });
  const ran = useRef(false); // links are single-use, so don't call twice in StrictMode

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const token = params.get('token');
    if (!token) return setStatus({ state: 'error', message: 'This link is missing its token.' });
    api
      .post('/auth/verify-email', { token }, { auth: false })
      .then((r) => setStatus({ state: 'ok', message: r.message }))
      .catch((e) => setStatus({ state: 'error', message: e.message }));
  }, [params]);

  return (
    <AuthLayout title="Email verification" footer={<Link to="/login">Go to log in</Link>}>
      {status.state === 'loading' && <p className="muted">Verifying…</p>}
      {status.state === 'ok' && <Alert kind="success">{status.message}</Alert>}
      {status.state === 'error' && (
        <>
          <Alert>{status.message}</Alert>
          <p className="muted small">Log in with your password to request a new link.</p>
        </>
      )}
    </AuthLayout>
  );
}
