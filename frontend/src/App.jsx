// App.jsx
import React from 'react';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

import Login from './pages/Login';
import Register from './pages/Register';

// Your page components:
import PatientDashboard from './pages/PatientDashboard';
import DoctorWorkspace from './pages/doctor';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          {/* Patient and Student Route */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRole="patient">
                <PatientDashboard />
              </ProtectedRoute>
            }
          />
          {/* You can also do allowedRole="student" if they have a separate dashboard */}

          {/* Doctor Route */}
          <Route
            path="/doctor-workspace"
            element={
              <ProtectedRoute allowedRole="doctor">
                <DoctorWorkspace />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}