import React, { createContext, useContext, useEffect, useState } from 'react';
import { authAPI } from '../api/client';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null); // ADDED: explicitly track role
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = localStorage.getItem('token');
      const storedRole = localStorage.getItem('role');
      
      if (storedToken) {
        try {
          const res = await authAPI.getMe();
          setUser(res.data);
          // If backend sends a role use it, else fallback to local storage
          setRole(res.data.role || storedRole || 'patient'); 
        } catch (err) {
          logout();
        }
      }
      setLoading(false);
    };
    initializeAuth();
  }, []);

  // FIXED: Now accepts token, role, and profileData
  const login = (token, userRole, profileData) => {
    localStorage.setItem('token', token);
    localStorage.setItem('role', userRole);
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