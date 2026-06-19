import React, { createContext, useState, useEffect, useContext } from 'react';
import { authAPI } from '../api/client';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = localStorage.getItem('token');
      const storedRole = localStorage.getItem('role');
      if (storedToken && storedRole) {
        try {
          if (storedRole === 'patient') {
            const res = await authAPI.getMe();
            setUser(res.data);
          } else {
            const res = await authAPI.getDoctorMe();
            setUser(res.data);
          }
          setRole(storedRole);
        } catch (err) {
          logout();
        }
      }
      setLoading(false);
    };
    initializeAuth();
  }, []);

  const login = (token, userRole, profileData) => {
    localStorage.setItem('token', token);
    localStorage.setItem('role', userRole);
    if (profileData?.email) localStorage.setItem('userEmail', profileData.email);
    setRole(userRole);
    setUser(profileData);
  };

  const logout = () => {
    localStorage.clear();
    setUser(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
