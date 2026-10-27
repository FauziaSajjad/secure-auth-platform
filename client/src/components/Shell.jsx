import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

export default function Shell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand brand-dark">Secure Auth</Link>
        <nav>
          <NavLink to="/" end>Account</NavLink>
          {user.role === 'admin' && <NavLink to="/admin">Users</NavLink>}
        </nav>
        <button className="btn btn-ghost" onClick={async () => { await logout(); navigate('/login'); }}>
          Log out
        </button>
      </header>
      <main className="page">{children}</main>
    </div>
  );
}
