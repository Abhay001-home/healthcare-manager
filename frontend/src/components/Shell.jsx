import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Shell({ children }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem('hm_theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('hm_theme', theme);
  }, [theme]);

  const handleSignOut = () => { signOut(); navigate('/login'); };

  return (
    <>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '13px 24px',
        background: 'var(--bg-elevated)',
        borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: 'var(--primary)', color: 'var(--primary-contrast)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700,
          }}>✚</div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, lineHeight: 1.1 }}>
              Meridian Clinic
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', letterSpacing: .3 }}>
              Appointment & Follow-up
            </div>
          </div>
        </div>

        {/* Right controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setTheme((t) => t === 'light' ? 'dark' : 'light')}
            className="btn btn-secondary btn-sm"
            title="Toggle light / dark theme"
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>

          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 10, borderLeft: '1px solid var(--border)' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{user.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'capitalize' }}>
                  {user.role}
                </div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={handleSignOut}>Sign out</button>
            </div>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px 72px' }}>
        {children}
      </main>
    </>
  );
}
