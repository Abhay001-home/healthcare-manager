import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Shell from './components/Shell';
import LoginPage from './pages/LoginPage';
import PatientPortal from './pages/PatientPortal';
import DoctorPortal from './pages/DoctorPortal';
import AdminPortal from './pages/AdminPortal';
import CalendarConnected from './pages/CalendarConnected';

function ProtectedRoute({ children, role }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return children;
}

function RoleRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'patient') return <Navigate to="/patient" replace />;
  if (user.role === 'doctor')  return <Navigate to="/doctor"  replace />;
  if (user.role === 'admin')   return <Navigate to="/admin"   replace />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Shell>
          <Routes>
            <Route path="/login"             element={<LoginPage />} />
            <Route path="/calendar-connected" element={<CalendarConnected />} />
            <Route path="/"                  element={<RoleRedirect />} />
            <Route path="/patient/*"         element={<ProtectedRoute role="patient"><PatientPortal /></ProtectedRoute>} />
            <Route path="/doctor/*"          element={<ProtectedRoute role="doctor"><DoctorPortal /></ProtectedRoute>} />
            <Route path="/admin/*"           element={<ProtectedRoute role="admin"><AdminPortal /></ProtectedRoute>} />
          </Routes>
        </Shell>
      </BrowserRouter>
    </AuthProvider>
  );
}
