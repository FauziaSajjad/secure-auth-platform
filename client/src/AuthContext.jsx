import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const clearSession = useCallback(() => {
    api.setAccessToken(null);
    setUser(null);
  }, []);

  // Restore the session on page load using the refresh cookie.
  useEffect(() => {
    let alive = true;
    api
      .refresh()
      .then((d) => alive && setUser(d.user))
      .catch(() => {})
      .finally(() => alive && setReady(true));
    api.onSessionExpired(clearSession);
    return () => {
      alive = false;
    };
  }, [clearSession]);

  const login = useCallback(async (email, password) => {
    const d = await api.post('/auth/login', { email, password }, { auth: false });
    api.setAccessToken(d.accessToken);
    setUser(d.user);
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout', null, { auth: false }).catch(() => {});
    clearSession();
  }, [clearSession]);

  const value = useMemo(() => ({ user, ready, login, logout, clearSession }), [user, ready, login, logout, clearSession]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
