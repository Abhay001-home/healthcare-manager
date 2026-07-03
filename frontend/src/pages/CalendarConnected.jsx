import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function CalendarConnected() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => {
      navigate(user?.role === 'doctor' ? '/doctor' : '/patient');
    }, 3000);
    return () => clearTimeout(t);
  }, [navigate, user]);

  return (
    <div className="center-page">
      <div className="card" style={{ padding: 36, textAlign: 'center', maxWidth: 400 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
          Google Calendar connected!
        </div>
        <p style={{ fontSize: 14, color: 'var(--text-soft)', marginBottom: 20 }}>
          Appointment events will now be automatically created, updated, and deleted in your Google Calendar.
          Redirecting you back…
        </p>
        <button className="btn btn-primary" onClick={() => navigate(user?.role === 'doctor' ? '/doctor' : '/patient')}>
          Go to portal now
        </button>
      </div>
    </div>
  );
}
