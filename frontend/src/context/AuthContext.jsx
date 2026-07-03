import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { login as apiLogin, register as apiRegister } from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]     = useState(() => {
    try { return JSON.parse(localStorage.getItem('hm_user')); } catch { return null; }
  });
  const [loading, setLoading] = useState(false);

  const signIn = useCallback(async ({ email, password }) => {
    setLoading(true);
    try {
      const { token, user: u } = await apiLogin({ email, password });
      localStorage.setItem('hm_token', token);
      localStorage.setItem('hm_user', JSON.stringify(u));
      setUser(u);
      return u;
    } finally {
      setLoading(false);
    }
  }, []);

  const signUp = useCallback(async (data) => {
    setLoading(true);
    try {
      const { token, user: u } = await apiRegister(data);
      localStorage.setItem('hm_token', token);
      localStorage.setItem('hm_user', JSON.stringify(u));
      setUser(u);
      return u;
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem('hm_token');
    localStorage.removeItem('hm_user');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
