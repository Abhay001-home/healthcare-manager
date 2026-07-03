import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login'); // login | register
  const [role, setRole] = useState('patient');
  const [form, setForm] = useState({ name: '', email: '', password: '', specialisation: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      let user;
      if (mode === 'login') {
        user = await signIn({ email: form.email, password: form.password });
      } else {
        user = await signUp({ ...form, role });
      }
      navigate(user.role === 'admin' ? '/admin' : user.role === 'doctor' ? '/doctor' : '/patient');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="center-page">
      <div className="card" style={{ width: 420, padding: 28 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
          {mode === 'login' ? 'Welcome back' : 'Create account'}
        </div>
        <p style={{ fontSize: 13.5, color: 'var(--text-soft)', marginBottom: 22 }}>
          {mode === 'login' ? 'Sign in to your portal.' : 'Register a new account.'}
        </p>

        {mode === 'register' && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: 'var(--bg-sunken)', padding: 4, borderRadius: 10 }}>
            {['patient', 'doctor', 'admin'].map((r) => (
              <button key={r} onClick={() => setRole(r)}
                style={{
                  flex: 1, padding: '7px 0', borderRadius: 7, border: 'none', cursor: 'pointer',
                  fontWeight: 700, fontSize: 12.5, textTransform: 'capitalize',
                  background: role === r ? 'var(--bg-elevated)' : 'transparent',
                  color: role === r ? 'var(--primary)' : 'var(--text-soft)',
                  boxShadow: role === r ? 'var(--shadow-sm)' : 'none',
                }}>{r}</button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <label className="field">
              <span className="label">Full name</span>
              <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Jane Doe" required />
            </label>
          )}
          <label className="field">
            <span className="label">Email</span>
            <input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="jane@email.com" required />
          </label>
          <label className="field">
            <span className="label">Password</span>
            <input className="input" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="••••••••" required minLength={6} />
          </label>
          {mode === 'register' && role === 'doctor' && (
            <label className="field">
              <span className="label">Specialisation</span>
              <input className="input" value={form.specialisation} onChange={(e) => set('specialisation', e.target.value)} placeholder="e.g. Cardiology" required />
            </label>
          )}

          {error && <div className="error-box">{error}</div>}

          <button className="btn btn-primary" style={{ width: '100%', marginBottom: 12 }} disabled={loading} type="submit">
            {loading ? <><span className="spinner" /> Working…</> : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 13 }}>
          {mode === 'login'
            ? <> No account? <a onClick={() => { setMode('register'); setError(''); }} style={{ cursor: 'pointer', fontWeight: 700 }}>Register</a> </>
            : <> Have an account? <a onClick={() => { setMode('login'); setError(''); }} style={{ cursor: 'pointer', fontWeight: 700 }}>Sign in</a> </>}
        </p>

        {mode === 'login' && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px dashed var(--border)', fontSize: 12, color: 'var(--text-faint)' }}>
            Demo credentials (after running <code>npm run seed</code>):<br />
            Patient: aman@mail.test / patient123 &nbsp;·&nbsp; Doctor: meera@clinic.test / doctor123 &nbsp;·&nbsp; Admin: admin@clinic.test / admin123
          </div>
        )}
      </div>
    </div>
  );
}
