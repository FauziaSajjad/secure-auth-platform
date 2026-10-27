import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../AuthContext.jsx';
import { api } from '../api.js';
import { Alert } from '../components/Form.jsx';

const LIMIT = 8;

export default function Admin() {
  const { user: me } = useAuth();
  const [data, setData] = useState({ users: [], total: 0 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api
      .get(`/users?page=${page}&limit=${LIMIT}&search=${encodeURIComponent(query)}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [page, query]);

  useEffect(load, [load]);

  const changeRole = async (id, role) => {
    setError('');
    try {
      await api.patch(`/users/${id}/role`, { role });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const pages = Math.max(Math.ceil(data.total / LIMIT), 1);

  return (
    <>
      <h1>Users</h1>
      <section className="panel">
        <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(search); }}>
          <input placeholder="Search by name or email" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search users" />
          <button className="btn btn-ghost">Search</button>
        </form>
        <Alert>{error}</Alert>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Email</th><th>Verified</th><th>Joined</th><th>Role</th></tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.emailVerified ? 'Yes' : 'No'}</td>
                  <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td>
                    <select value={u.role} disabled={u.id === me.id} onChange={(e) => changeRole(u.id, e.target.value)} aria-label={`Role for ${u.email}`}>
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                </tr>
              ))}
              {data.users.length === 0 && (
                <tr><td colSpan="5" className="muted">No users match that search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="muted small">Page {page} of {pages} · {data.total} users</span>
          <button className="btn btn-ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </section>
    </>
  );
}
