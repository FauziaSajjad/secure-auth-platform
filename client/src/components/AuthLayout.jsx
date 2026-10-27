import { Link } from 'react-router-dom';

const ledger = [
  ['Password', 'Hashed with bcrypt (cost 12). The plain text is never stored or logged.'],
  ['Access token', 'Signed JWT, valid 15 minutes, held in memory only.'],
  ['Refresh token', 'Random, httpOnly cookie, replaced on every use. A replayed token ends the session.'],
  ['Sign-in attempts', 'Rate limited per IP. Five wrong passwords lock the account for 15 minutes.'],
];

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="auth">
      <aside className="auth-aside">
        <Link to="/" className="brand">Secure Auth</Link>
        <div>
          <h2>How your session is protected</h2>
          <dl className="ledger">
            {ledger.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-card">
          <h1>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
          {children}
          {footer && <p className="auth-footer">{footer}</p>}
        </div>
      </main>
    </div>
  );
}
