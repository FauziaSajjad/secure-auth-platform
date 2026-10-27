import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { api } from '../api.js';
import { Alert, Field, StrengthMeter, useSubmit } from '../components/Form.jsx';

export default function Dashboard() {
  const { user, clearSession } = useAuth();
  const navigate = useNavigate();
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [notice, setNotice] = useState('');

  const change = useSubmit(async () => {
    await api.post('/auth/change-password', pw);
    clearSession(); // server revoked every session, so sign in again
    navigate('/login', { state: { notice: 'Password changed. Log in again.' } });
  });

  const logoutAll = async () => {
    await api.post('/auth/logout-all');
    clearSession();
    navigate('/login', { state: { notice: 'Signed out of all devices.' } });
  };

  const since = new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <>
      <h1>Hi, {user.name}</h1>
      <section className="panel">
        <h2>Your account</h2>
        <dl className="facts">
          <div><dt>Email</dt><dd>{user.email}</dd></div>
          <div><dt>Role</dt><dd><span className={`badge badge-${user.role}`}>{user.role}</span></dd></div>
          <div><dt>Email status</dt><dd>{user.emailVerified ? 'Verified' : 'Not verified'}</dd></div>
          <div><dt>Member since</dt><dd>{since}</dd></div>
        </dl>
      </section>

      <section className="panel">
        <h2>Change password</h2>
        <p className="muted">You'll be signed out on every device after changing it.</p>
        <form onSubmit={change.submit} noValidate className="narrow">
          <Alert>{change.error}</Alert>
          <Field label="Current password" type="password" autoComplete="current-password" value={pw.currentPassword}
            onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} error={change.fields.currentPassword} required />
          <Field label="New password" type="password" autoComplete="new-password" value={pw.newPassword}
            onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} error={change.fields.newPassword} required />
          <StrengthMeter password={pw.newPassword} />
          <button className="btn" disabled={change.loading}>{change.loading ? 'Saving…' : 'Change password'}</button>
        </form>
      </section>

      <section className="panel">
        <h2>Active sessions</h2>
        <p className="muted">Lost a device or think someone else has access? End every session now.</p>
        <Alert kind="success">{notice}</Alert>
        <button className="btn btn-danger" onClick={logoutAll}>Sign out of all devices</button>
      </section>
    </>
  );
}
