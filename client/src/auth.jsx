import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { get, post, getToken, setToken } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) { setReady(true); return; }
    get('/auth/me').then((r) => setUser(r.user)).catch(() => setToken(null)).finally(() => setReady(true));
  }, []);

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
  }, []);

  const login = useCallback(async (username, password) => {
    const r = await post('/auth/login', { username, password });
    setToken(r.token);
    setUser(r.user);
  }, []);

  const logout = useCallback(() => { setToken(null); setUser(null); }, []);

  const can = useCallback((...perms) => !!user && perms.some((p) => user.permissions?.includes(p)), [user]);
  return <AuthCtx.Provider value={{ user, ready, login, logout, can }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
