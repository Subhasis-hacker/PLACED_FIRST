import React from 'react';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

// --- Page Components ---
import Login from './pages/Login';
import Register from './pages/Register';
import PatientDashboard from './pages/PatientDashboard';
import DoctorWorkspace from './pages/doctor';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Authentication Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          {/* 
            Patient Route 
            Includes: AI Reports, Triage Chatbot, Doctor Search, and Slot Booking 
          */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRole="patient">
                <PatientDashboard />
              </ProtectedRoute>
            }
          />

          {/* 
            Doctor Route 
            Includes: Real-time Analytics and Active Patient Queue 
          */}
          <Route
            path="/doctor-workspace"
            element={
              <ProtectedRoute allowedRole="doctor">
                <DoctorWorkspace />
              </ProtectedRoute>
            }
          />

          {/* Fallback routing for unknown paths */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}