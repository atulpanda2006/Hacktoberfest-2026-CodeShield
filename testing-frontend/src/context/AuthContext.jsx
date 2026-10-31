import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { TOKEN_KEY, authApi } from '../services/api';

const USER_KEY = 'ttn_user';
const AuthContext = createContext(null);

function readStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Authentication state backed by the backend's JWT contract.
 * The token comes from `data.token` in the login/register responses and is sent
 * as `Authorization: Bearer <token>` by the Axios instance.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [booting, setBooting] = useState(Boolean(localStorage.getItem(TOKEN_KEY)));

  const persistSession = useCallback((nextUser, nextToken) => {
    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  // Re-validate a stored token against the backend on first load.
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!localStorage.getItem(TOKEN_KEY)) {
        setBooting(false);
        return;
      }

      try {
        const response = await authApi.me();
        if (cancelled) return;
        const freshUser = response.data?.data?.user ?? null;
        setUser(freshUser);
        if (freshUser) localStorage.setItem(USER_KEY, JSON.stringify(freshUser));
      } catch {
        if (!cancelled) clearSession();
      } finally {
        if (!cancelled) setBooting(false);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const login = useCallback(
    async (credentials) => {
      const response = await authApi.login(credentials);
      const data = response.data?.data ?? {};
      persistSession(data.user, data.token);
      return data.user;
    },
    [persistSession]
  );

  const register = useCallback(
    async (payload) => {
      const response = await authApi.register(payload);
      const data = response.data?.data ?? {};
      persistSession(data.user, data.token);
      return data.user;
    },
    [persistSession]
  );

  const logout = useCallback(async () => {
    try {
      // Stateless JWT: the backend acknowledges, the client discards the token.
      await authApi.logout();
    } catch {
      // Ignore network errors on logout; the local session is still cleared.
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo(
    () => ({
      user,
      token,
      booting,
      isAuthenticated: Boolean(token && user),
      login,
      register,
      logout,
      refreshUser: async () => {
        const response = await authApi.me();
        const freshUser = response.data?.data?.user ?? null;
        setUser(freshUser);
        if (freshUser) localStorage.setItem(USER_KEY, JSON.stringify(freshUser));
        return freshUser;
      },
    }),
    [user, token, booting, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
