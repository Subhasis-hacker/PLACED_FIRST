import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const normalizeRole = (value) => {
  if (!value) return null;
  return String(value).trim().toLowerCase();
};

export default function ProtectedRoute({ children, allowedRole }) {
  const { user, role, loading } = useAuth();
  const normalizedRole = normalizeRole(role);
  const normalizedAllowedRole = normalizeRole(allowedRole);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (normalizedAllowedRole && normalizedRole !== normalizedAllowedRole) {
    return <Navigate to={normalizedRole === 'doctor' ? '/doctor-workspace' : '/dashboard'} replace />;
  }

  return children;
}
