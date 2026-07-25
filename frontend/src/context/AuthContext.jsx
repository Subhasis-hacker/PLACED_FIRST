import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { authAPI } from '../api/client';

const AuthContext = createContext(null);

const normalizeRole = (value) => {
  if (!value) return null;
  return String(value).trim().toLowerCase();
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearAuthState = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    setUser(null);
    setRole(null);
  };

  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = localStorage.getItem('token');
      const storedRole = normalizeRole(localStorage.getItem('role'));

      if (!storedToken) {
        setLoading(false);
        return;
      }

      try {
        const res = await authAPI.getMe(storedToken);
        const nextUser = res.data;
        const nextRole = normalizeRole(nextUser?.role || storedRole || 'patient');
        setUser(nextUser);
        setRole(nextRole);
        localStorage.setItem('role', nextRole || 'patient');
      } catch (err) {
        clearAuthState();
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = (token, userRole, profileData) => {
    const nextRole = normalizeRole(userRole) || 'patient';
    localStorage.setItem('token', token);
    localStorage.setItem('role', nextRole);
    setRole(nextRole);
    setUser(profileData);
  };

  const logout = () => {
    clearAuthState();
  };

  const value = useMemo(() => ({ user, role, loading, login, logout }), [user, role, loading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);