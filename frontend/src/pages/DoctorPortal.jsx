import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getAppointments, cancelAppointment,
  generatePreVisit, submitPostVisit,
  getCalendarAuthUrl, getCalendarStatus,
} from '../utils/api';

export default function DoctorPortal() {
  const { user } = useAuth();
  const [tab, setTab]   = useState('upcoming');
  const [appts, setAppts] = useState([]);
  const [calConnected, setCalConnected] = useState(false);
  const [calLoading, setCalLoading]     = useState(false);

  const load = useCallback(async () => {
    try { setAppts(await getAppointments()); } catch {}
  }, []);

  useEffect(() => {
    load();
    getCalendarStatus().then((r) => setCalConnected(r.connected)).catch(() => {});
  }, [load]);

  async function connectCalendar() {
    setCalLoading(true);
    try {
      const { url } = await getCalendarAuthUrl();
      window.location.href = url;
    } catch { setCalLoading(false); }
  }

  const upcoming  = appts.filter((a) => a.status === 'confirmed').sort(byDateTime);
  const completed = appts.filter((a) => a.status === 'completed').sort(byDateTimeDesc);
  const list = tab === 'upcoming' ? upcoming : completed;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div>
          <div className="page-title">Doctor portal</div>
          <div className="page-sub">Manage your appointments, review symptoms, and submit post-visit notes.</div>
        </div>
        {!calConnected ? (
          <button className="btn btn-outline btn-sm" onClick={connectCalendar} disabled={calLoading}>
            {calLoading ? <><span className="spinner" /> Connecting…</> : '📅 Connect Google Calendar'}
          </button>
        ) : (
          <span className="badge badge-ok" style={{ alignSelf: 'center' }}>📅 Calendar connected</span>
        )}
      </div>

      <div className="tabs">
        {[['upcoming', `Upcoming (${upcoming.length})`], ['completed', `Completed (${completed.length})`]].map(([id, label]) => (
          <button key={id} className={`tab-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {list.length === 0 ? (
        <Empty icon="🩺" title="Nothing here" body="Appointments will appear as patients book visits." />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {list.map((a) => (
            <DoctorApptCard key={a.id} appt={a} reload={load} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Per-appointment card ─────────────────────────────────────────────────── */
function DoctorApptCard({ appt, reload }) {
  const [open, setOpen]           = useState(false);
  const [preLoading, setPreLoading] = useState(false);
  const [preError, setPreError]   = useState('');
  const [preData, setPreData]     = useState(
    appt.urgency_level ? { urgency_level: appt.urgency_level, chief_complaint: appt.chief_complaint, suggested_questions: appt.suggested_questions } : null
  );
  const [cancelling, setCancelling] = useState(false);

  // Post-visit form state
  const [notes, setNotes]       = useState(appt.doctor_notes || '');
  const [rx, setRx]             = useState([{ drug_name: '', dosage: '', frequency: 'Once daily', duration_days: 5 }]);
  const [postLoading, setPostLoading] = useState(false);
  const [postError, setPostError] = useState('');
  const [postDone, setPostDone]  = useState(!!appt.patient_summary);

  function updateRx(i, key, val) {
    setRx((r) => r.map((row, idx) => idx === i ? { ...row, [key]: val } : row));
  }

  async function handlePreVisit() {
    setPreError(''); setPreLoading(true);
    try {
      const res = await generatePreVisit(appt.id);
      setPreData(res);
    } catch (e) { setPreError(e.message); }
    finally { setPreLoading(false); }
  }

  async function handlePostVisit() {
    setPostError(''); setPostLoading(true);
    try {
      await submitPostVisit(appt.id, { notes, prescriptions: rx.filter((r) => r.drug_name.trim()) });
      setPostDone(true);
      reload();
    } catch (e) { setPostError(e.message); }
    finally { setPostLoading(false); }
  }

  async function handleCancel() {
    if (!confirm('Cancel this appointment?')) return;
    setCancelling(true);
    try { await cancelAppointment(appt.id); reload(); } catch {}
    finally { setCancelling(false); }
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setOpen((o) => !o)}>
        <div>
          <div style={{ fontWeight: 700 }}>{appt.patient_name}</div>
          <div style={{ fontSize: 13, color: 'var(--text-soft)' }}>
            {fmtDate(appt.appt_date)} at {fmtTime(appt.appt_time)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {preData?.urgency_level && <UrgencyBadge level={preData.urgency_level} />}
          <StatusBadge status={appt.status} />
          <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px dashed var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Left: symptoms + pre-visit summary */}
            <div>
              <SectionTitle>Patient symptoms</SectionTitle>
              <div className="card-sunken" style={{ padding: 12, marginBottom: 14 }}>
                <p style={{ fontSize: 13.5 }}>{appt.symptom_text || 'No symptoms submitted.'}</p>
                {appt.duration_days && (
                  <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 6 }}>Duration: {appt.duration_days} day(s)</p>
                )}
              </div>

              <SectionTitle>AI pre-visit summary</SectionTitle>
              {!preData && !preLoading && (
                <button className="btn btn-outline btn-sm" onClick={handlePreVisit}>Generate summary</button>
              )}
              {preLoading && <Spinner label="Analysing symptoms…" />}
              {preError && (
                <div className="error-box" style={{ marginTop: 0 }}>
                  {preError} <a onClick={handlePreVisit} style={{ cursor: 'pointer', fontWeight: 700 }}>Retry</a>
                </div>
              )}
              {preData && !preError && (
                <div className="card-sunken" style={{ padding: 12 }}>
                  {preData.error && <p style={{ color: 'var(--warn)', fontSize: 13, marginBottom: 8 }}>{preData.error}</p>}
                  {preData.urgency_level && <UrgencyBadge level={preData.urgency_level} />}
                  {preData.chief_complaint && (
                    <>
                      <div style={{ fontWeight: 700, fontSize: 13, marginTop: 10 }}>Chief complaint</div>
                      <p style={{ fontSize: 13.5, color: 'var(--text-soft)', marginBottom: 8 }}>{preData.chief_complaint}</p>
                    </>
                  )}
                  {preData.suggested_questions?.length > 0 && (
                    <>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Suggested questions</div>
                      <ul style={{ paddingLeft: 18, margin: 0, fontSize: 13, color: 'var(--text-soft)' }}>
                        {preData.suggested_questions.map((q, i) => <li key={i}>{q}</li>)}
                      </ul>
                    </>
                  )}
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: 10, padding: 0, fontSize: 12 }} onClick={handlePreVisit}>
                    ↻ Regenerate
                  </button>
                </div>
              )}

              {appt.status === 'confirmed' && (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ marginTop: 14, color: 'var(--danger)' }}
                  disabled={cancelling}
                  onClick={handleCancel}
                >
                  {cancelling ? <><span className="spinner" /> Cancelling…</> : 'Cancel this visit'}
                </button>
              )}
            </div>

            {/* Right: post-visit notes + prescription */}
            <div>
              {postDone && appt.patient_summary ? (
                <>
                  <SectionTitle>Patient-friendly summary (sent)</SectionTitle>
                  <div className="card-sunken" style={{ padding: 12 }}>
                    <p style={{ fontSize: 13.5, color: 'var(--text-soft)' }}>{appt.patient_summary}</p>
                  </div>
                </>
              ) : (
                <>
                  <SectionTitle>Post-visit notes</SectionTitle>
                  <textarea
                    className="textarea"
                    rows={4}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Clinical findings, diagnosis, and advice given…"
                    style={{ marginBottom: 12 }}
                  />

                  <SectionTitle>Prescription</SectionTitle>
                  {rx.map((row, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1.2fr 0.6fr auto', gap: 5, marginBottom: 6 }}>
                      <input className="input" placeholder="Drug name" value={row.drug_name} onChange={(e) => updateRx(i, 'drug_name', e.target.value)} />
                      <input className="input" placeholder="Dosage" value={row.dosage} onChange={(e) => updateRx(i, 'dosage', e.target.value)} />
                      <select className="select" value={row.frequency} onChange={(e) => updateRx(i, 'frequency', e.target.value)}>
                        {['Once daily','Twice daily','Thrice daily','Every 8 hours','As needed'].map((f) => <option key={f}>{f}</option>)}
                      </select>
                      <input className="input" type="number" min={1} value={row.duration_days} onChange={(e) => updateRx(i, 'duration_days', Number(e.target.value))} title="Days" />
                      <button onClick={() => setRx((r) => r.filter((_, idx) => idx !== i))}
                        style={{ border: 'none', background: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>✕</button>
                    </div>
                  ))}
                  <button className="btn btn-ghost btn-sm" onClick={() => setRx((r) => [...r, { drug_name: '', dosage: '', frequency: 'Once daily', duration_days: 5 }])} style={{ marginBottom: 12 }}>
                    + Add medicine
                  </button>

                  {postError && <div className="error-box">{postError}</div>}
                  <br />
                  <button className="btn btn-primary" disabled={!notes.trim() || postLoading} onClick={handlePostVisit}>
                    {postLoading ? <><span className="spinner" /> Generating summary…</> : 'Generate & send patient summary'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── helpers ─────────────────────────────────────────────────────────────── */
function SectionTitle({ children }) {
  return <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text-soft)' }}>{children}</div>;
}
function Spinner({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-soft)' }}>
      <span className="spinner" />{label}
    </div>
  );
}
function Empty({ icon, title, body }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-faint)' }}>
      <div style={{ fontSize: 30, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontWeight: 700, color: 'var(--text-soft)', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13.5 }}>{body}</div>
    </div>
  );
}
function StatusBadge({ status }) {
  const map = { confirmed: ['badge-primary','Confirmed'], completed: ['badge-ok','Completed'], cancelled: ['badge-danger','Cancelled'] };
  const [cls, label] = map[status] || ['badge-neutral', status];
  return <span className={`badge ${cls}`}>{label}</span>;
}
function UrgencyBadge({ level }) {
  const map = { High: 'badge-danger', Medium: 'badge-warn', Low: 'badge-ok' };
  return <span className={`badge ${map[level] || 'badge-neutral'}`}>{level} urgency</span>;
}
function byDateTime(a, b) { return (a.appt_date + a.appt_time) < (b.appt_date + b.appt_time) ? -1 : 1; }
function byDateTimeDesc(a, b) { return byDateTime(b, a); }
function fmtDate(d) { return new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); }
function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.slice(0,5).split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
