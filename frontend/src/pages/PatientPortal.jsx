import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getDoctors, getSpecialisations, getAvailability,
  holdSlot, confirmAppointment, getAppointments, cancelAppointment,
  getCalendarAuthUrl, getCalendarStatus,
} from '../utils/api';

export default function PatientPortal() {
  const { user } = useAuth();
  const [tab, setTab] = useState('book');
  const [appts, setAppts] = useState([]);

  const loadAppts = useCallback(async () => {
    try { setAppts(await getAppointments()); } catch {}
  }, []);

  useEffect(() => { loadAppts(); }, [loadAppts]);

  return (
    <div>
      <div className="page-title">Patient portal</div>
      <div className="page-sub">Hi {user.name} — book visits and review your health summaries.</div>

      <div className="tabs">
        {[['book', 'Book appointment'], ['mine', `My appointments (${appts.length})`]].map(([id, label]) => (
          <button key={id} className={`tab-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'book' && <BookFlow onBooked={loadAppts} />}
      {tab === 'mine' && <MyAppointments appts={appts} reload={loadAppts} />}
    </div>
  );
}

/* ── Book appointment flow ───────────────────────────────────────────────── */
function BookFlow({ onBooked }) {
  const [step, setStep]               = useState(1);
  const [specs, setSpecs]             = useState([]);
  const [spec, setSpec]               = useState('');
  const [doctors, setDoctors]         = useState([]);
  const [doctorId, setDoctorId]       = useState('');
  const [date, setDate]               = useState(tomorrow());
  const [slots, setSlots]             = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedTime, setSelectedTime] = useState('');
  const [holdId, setHoldId]           = useState(null);
  const [symptomText, setSymptomText] = useState('');
  const [durationDays, setDurationDays] = useState(1);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [done, setDone]               = useState(null);

  useEffect(() => {
    getSpecialisations().then((s) => { setSpecs(s); setSpec(s[0] || ''); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!spec) return;
    getDoctors(spec).then((ds) => { setDoctors(ds); setDoctorId(ds[0]?.id || ''); }).catch(() => {});
  }, [spec]);

  useEffect(() => {
    if (!doctorId || !date) return;
    setSlotsLoading(true);
    getAvailability(doctorId, date)
      .then((r) => setSlots(r.available ? r.slots : []))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [doctorId, date]);

  async function handleHold(time) {
    setError(''); setLoading(true);
    try {
      const res = await holdSlot({ doctor_id: doctorId, appt_date: date, appt_time: time });
      setHoldId(res.hold_id);
      setSelectedTime(time);
      setStep(2);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function handleConfirm() {
    setError(''); setLoading(true);
    try {
      await confirmAppointment({ hold_id: holdId, symptom_text: symptomText, duration_days: durationDays });
      setDone({ doctorId, date, time: selectedTime });
      onBooked();
    } catch (e) { setError(e.message); setStep(1); }
    finally { setLoading(false); }
  }

  if (done) return (
    <div className="card" style={{ padding: 28, textAlign: 'center' }}>
      <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Appointment confirmed</div>
      <p style={{ color: 'var(--text-soft)', marginBottom: 18 }}>
        A confirmation email and Google Calendar invite have been sent. Your pre-visit symptom summary is being generated.
      </p>
      <button className="btn btn-primary" onClick={() => { setDone(null); setStep(1); setHoldId(null); setSymptomText(''); }}>
        Book another
      </button>
    </div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20 }}>
      {/* Filters */}
      <div className="card" style={{ padding: 18, height: 'fit-content' }}>
        <label className="field">
          <span className="label">Specialisation</span>
          <select className="select" value={spec} onChange={(e) => setSpec(e.target.value)}>
            {specs.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="label">Doctor</span>
          <select className="select" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
            {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="label">Date</span>
          <input className="input" type="date" value={date} min={tomorrow()} onChange={(e) => { setDate(e.target.value); setStep(1); }} />
        </label>
        {error && <div className="error-box">{error}</div>}
      </div>

      {/* Slot picker or symptom form */}
      <div className="card" style={{ padding: 20 }}>
        {step === 1 && (
          <>
            <div style={{ fontWeight: 700, marginBottom: 14 }}>
              {slotsLoading ? 'Loading slots…' : `Available slots — ${fmtDate(date)}`}
            </div>
            {slotsLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-soft)' }}>
                <span className="spinner" /> Loading…
              </div>
            ) : slots.length === 0 ? (
              <div style={{ color: 'var(--text-faint)' }}>No slots available on this date.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(92px,1fr))', gap: 8 }}>
                {slots.map((s) => (
                  <button
                    key={s.time}
                    disabled={!s.available || loading}
                    onClick={() => handleHold(s.time)}
                    style={{
                      padding: '9px 6px', borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: s.available ? 'var(--bg)' : 'var(--bg-sunken)',
                      color: s.available ? 'var(--text)' : 'var(--text-faint)',
                      cursor: s.available ? 'pointer' : 'not-allowed',
                      textDecoration: !s.available ? 'line-through' : 'none',
                      fontWeight: 600, fontSize: 13,
                    }}
                  >
                    {fmtTime(s.time)}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={() => setStep(1)}>← Change slot</button>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              {fmtDate(date)} at {fmtTime(selectedTime)}
            </div>
            <p style={{ fontSize: 13.5, color: 'var(--text-soft)', marginBottom: 16 }}>
              Describe your symptoms so the doctor can prepare a personalised pre-visit summary.
            </p>
            <label className="field">
              <span className="label">Your symptoms</span>
              <textarea className="textarea" rows={4} value={symptomText} onChange={(e) => setSymptomText(e.target.value)}
                placeholder="E.g. Persistent headache and mild fever for the past two days, worse in the evenings…" />
            </label>
            <label className="field">
              <span className="label">How many days have you had these symptoms?</span>
              <input className="input" type="number" min={0} value={durationDays} onChange={(e) => setDurationDays(e.target.value)} style={{ width: 110 }} />
            </label>
            {error && <div className="error-box">{error}</div>}
            <button className="btn btn-primary" disabled={!symptomText.trim() || loading} onClick={handleConfirm}>
              {loading ? <><span className="spinner" /> Confirming…</> : 'Confirm appointment'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ── My appointments list ─────────────────────────────────────────────────── */
function MyAppointments({ appts, reload }) {
  const sorted = [...appts].sort((a, b) => (a.appt_date + a.appt_time > b.appt_date + b.appt_time ? -1 : 1));
  if (!sorted.length) return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-faint)' }}>
      <div style={{ fontSize: 28 }}>🗓️</div>
      <div style={{ fontWeight: 700, color: 'var(--text-soft)', margin: '8px 0 4px' }}>No appointments yet</div>
      <div>Book your first visit from the "Book appointment" tab.</div>
    </div>
  );

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {sorted.map((a) => <AppointmentCard key={a.id} appt={a} reload={reload} />)}
    </div>
  );
}

function AppointmentCard({ appt, reload }) {
  const [cancelling, setCancelling] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleCancel() {
    if (!confirm('Cancel this appointment?')) return;
    setCancelling(true);
    try { await cancelAppointment(appt.id); reload(); } catch {}
    finally { setCancelling(false); }
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700 }}>{appt.doctor_name} · {appt.specialisation}</div>
          <div style={{ fontSize: 13, color: 'var(--text-soft)' }}>
            {fmtDate(appt.appt_date)} at {fmtTime(appt.appt_time)}
          </div>
        </div>
        <StatusBadge status={appt.status} />
      </div>

      {appt.urgency_level && (
        <div style={{ marginTop: 8 }}>
          <UrgencyBadge level={appt.urgency_level} />
        </div>
      )}

      {appt.patient_summary && (
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-ghost btn-sm" style={{ padding: 0 }} onClick={() => setOpen((o) => !o)}>
            {open ? '▲ Hide visit summary' : '▼ View visit summary'}
          </button>
          {open && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--border)' }}>
              <div style={{ fontSize: 13.5, color: 'var(--text-soft)', marginBottom: 10 }}>{appt.patient_summary}</div>
              {appt.medication_schedule?.length > 0 && (
                <ul style={{ paddingLeft: 18, fontSize: 13, color: 'var(--text-soft)', marginBottom: 8 }}>
                  {appt.medication_schedule.map((m, i) => (
                    <li key={i}><strong>{m.drug}:</strong> {m.instructions}</li>
                  ))}
                </ul>
              )}
              <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{appt.follow_up_advice}</div>
            </div>
          )}
        </div>
      )}

      {appt.status === 'confirmed' && (
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} disabled={cancelling} onClick={handleCancel}>
            {cancelling ? <><span className="spinner" /> Cancelling…</> : 'Cancel appointment'}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── shared bits ─────────────────────────────────────────────────────────── */
function StatusBadge({ status }) {
  const map = { confirmed: ['badge-primary','Confirmed'], completed: ['badge-ok','Completed'], cancelled: ['badge-danger','Cancelled'] };
  const [cls, label] = map[status] || ['badge-neutral', status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

function UrgencyBadge({ level }) {
  const map = { High: 'badge-danger', Medium: 'badge-warn', Low: 'badge-ok' };
  return <span className={`badge ${map[level] || 'badge-neutral'}`}>{level} urgency</span>;
}

function tomorrow() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.slice(0, 5).split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
