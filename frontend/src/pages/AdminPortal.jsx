import React, { useState, useEffect, useCallback } from 'react';
import {
  getAdminStats, getAdminDoctors, createAdminDoctor, updateAdminDoctor,
  setDoctorLeave, removeDoctorLeave, getEmailLog, getReminders,
  getAdminPatients, getAppointments,
} from '../utils/api';

export default function AdminPortal() {
  const [tab, setTab] = useState('overview');

  return (
    <div>
      <div className="page-title">Admin console</div>
      <div className="page-sub">Manage doctor profiles, monitor system activity, and oversee all bookings.</div>
      <div className="tabs">
        {[
          ['overview', 'Overview'],
          ['doctors', 'Doctors'],
          ['appointments', 'Appointments'],
          ['ops', 'Email & Reminders'],
        ].map(([id, label]) => (
          <button key={id} className={`tab-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === 'overview'      && <Overview />}
      {tab === 'doctors'       && <DoctorsTab />}
      {tab === 'appointments'  && <AppointmentsTab />}
      {tab === 'ops'           && <OpsTab />}
    </div>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────────── */
function Overview() {
  const [stats, setStats] = useState(null);
  useEffect(() => { getAdminStats().then(setStats).catch(() => {}); }, []);

  if (!stats) return <div style={{ display: 'flex', gap: 8, color: 'var(--text-soft)' }}><span className="spinner" /> Loading…</div>;

  const cards = [
    { label: 'Confirmed appointments', value: stats.appointments.confirmed, tone: 'primary' },
    { label: 'Completed visits',       value: stats.appointments.completed, tone: 'ok' },
    { label: 'Cancellations',          value: stats.appointments.cancelled, tone: 'danger' },
    { label: 'Registered patients',    value: stats.patients.total,         tone: 'neutral' },
    { label: 'Doctors on platform',    value: stats.doctors.total,          tone: 'neutral' },
    { label: 'Emails sent',            value: stats.emails.sent,            tone: 'ok' },
    { label: 'Emails failed',          value: stats.emails.failed,          tone: 'danger' },
    { label: 'Emails queued',          value: stats.emails.queued,          tone: 'warn' },
  ];

  const toneColor = { primary: 'var(--primary)', ok: 'var(--ok)', danger: 'var(--danger)', warn: 'var(--warn)', neutral: 'var(--text-soft)' };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 14 }}>
      {cards.map((c) => (
        <div key={c.label} className="card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: toneColor[c.tone], fontFamily: 'var(--font-display)' }}>{c.value}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-soft)', marginTop: 4 }}>{c.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Doctors management ───────────────────────────────────────────────────── */
function DoctorsTab() {
  const [doctors, setDoctors] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: 'doctor123', specialisation: '', qualification: '', working_start: '09:00', working_end: '17:00', slot_duration: 20 });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => getAdminDoctors().then(setDoctors).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function handleCreate(e) {
    e.preventDefault(); setFormError(''); setSaving(true);
    try {
      await createAdminDoctor({ ...form, slot_duration: Number(form.slot_duration) });
      setCreating(false);
      setForm({ name: '', email: '', password: 'doctor123', specialisation: '', qualification: '', working_start: '09:00', working_end: '17:00', slot_duration: 20 });
      load();
    } catch (err) { setFormError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button className="btn btn-primary btn-sm" onClick={() => setCreating((c) => !c)}>
          {creating ? 'Cancel' : '+ Add doctor'}
        </button>
      </div>

      {creating && (
        <div className="card" style={{ padding: 20, marginBottom: 18 }}>
          <div style={{ fontWeight: 700, marginBottom: 14 }}>New doctor profile</div>
          <form onSubmit={handleCreate}>
            <div className="grid-3">
              <label className="field"><span className="label">Full name</span>
                <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required /></label>
              <label className="field"><span className="label">Email</span>
                <input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required /></label>
              <label className="field"><span className="label">Password</span>
                <input className="input" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} required minLength={6} /></label>
              <label className="field"><span className="label">Specialisation</span>
                <input className="input" value={form.specialisation} onChange={(e) => set('specialisation', e.target.value)} required /></label>
              <label className="field"><span className="label">Qualification</span>
                <input className="input" value={form.qualification} onChange={(e) => set('qualification', e.target.value)} placeholder="MBBS, MD…" /></label>
              <label className="field"><span className="label">Slot duration (min)</span>
                <input className="input" type="number" value={form.slot_duration} onChange={(e) => set('slot_duration', e.target.value)} /></label>
              <label className="field"><span className="label">Working start</span>
                <input className="input" type="time" value={form.working_start} onChange={(e) => set('working_start', e.target.value)} /></label>
              <label className="field"><span className="label">Working end</span>
                <input className="input" type="time" value={form.working_end} onChange={(e) => set('working_end', e.target.value)} /></label>
            </div>
            {formError && <div className="error-box">{formError}</div>}
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? <><span className="spinner" /> Saving…</> : 'Create doctor profile'}
            </button>
          </form>
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {doctors.map((d) => <DoctorAdminCard key={d.id} doctor={d} reload={load} />)}
      </div>
    </div>
  );
}

function DoctorAdminCard({ doctor, reload }) {
  const [leaveDate, setLeaveDate] = useState(tomorrow());
  const [leaveReason, setLeaveReason] = useState('');
  const [settingLeave, setSettingLeave] = useState(false);
  const [leaves, setLeaves] = useState([]);
  const [open, setOpen]     = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    specialisation: doctor.specialisation,
    qualification: doctor.qualification || '',
    working_start: doctor.working_start,
    working_end: doctor.working_end,
    slot_duration: doctor.slot_duration,
  });
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    if (open) {
      import('../utils/api').then(({ getDoctorLeaves }) =>
        getDoctorLeaves(doctor.id).then(setLeaves).catch(() => {})
      );
    }
  }, [open, doctor.id]);

  async function handleSetLeave() {
    setSettingLeave(true);
    try {
      const { affected_bookings } = await setDoctorLeave(doctor.id, { leave_date: leaveDate, reason: leaveReason });
      alert(`Leave set. ${affected_bookings} appointment(s) cancelled and patients notified.`);
      setLeaves((l) => [...l, { leave_date: leaveDate }]);
    } catch (e) { alert(e.message); }
    finally { setSettingLeave(false); }
  }

  async function handleRemoveLeave(date) {
    try { await removeDoctorLeave(doctor.id, date); setLeaves((l) => l.filter((x) => x.leave_date !== date)); } catch {}
  }

  async function handleEditSave() {
    setEditSaving(true);
    try {
      await updateAdminDoctor(doctor.id, { ...editForm, slot_duration: Number(editForm.slot_duration) });
      setEditing(false); reload();
    } catch (e) { alert(e.message); }
    finally { setEditSaving(false); }
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 700 }}>{doctor.name}</div>
          <div style={{ fontSize: 13, color: 'var(--text-soft)' }}>{doctor.specialisation} · {doctor.email}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 2 }}>
            {fmtTime(doctor.working_start)}–{fmtTime(doctor.working_end)} · {doctor.slot_duration} min slots
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing((e) => !e)}>Edit</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)}>
            {open ? '▲ Less' : '▼ Leave / details'}
          </button>
        </div>
      </div>

      {editing && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed var(--border)' }}>
          <div className="grid-3" style={{ gap: 10 }}>
            {[
              ['specialisation', 'Specialisation', 'text'],
              ['qualification', 'Qualification', 'text'],
              ['working_start', 'Start time', 'time'],
              ['working_end', 'End time', 'time'],
              ['slot_duration', 'Slot (min)', 'number'],
            ].map(([key, label, type]) => (
              <label key={key} className="field">
                <span className="label">{label}</span>
                <input className="input" type={type} value={editForm[key]}
                  onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))} />
              </label>
            ))}
          </div>
          <button className="btn btn-primary btn-sm" disabled={editSaving} onClick={handleEditSave}>
            {editSaving ? <><span className="spinner" /> Saving…</> : 'Save changes'}
          </button>
        </div>
      )}

      {open && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Leave management</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
            <label className="field" style={{ margin: 0 }}>
              <span className="label">Date</span>
              <input className="input" type="date" value={leaveDate} min={tomorrow()}
                onChange={(e) => setLeaveDate(e.target.value)} style={{ width: 160 }} />
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span className="label">Reason (optional)</span>
              <input className="input" value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)}
                placeholder="e.g. Conference" style={{ width: 200 }} />
            </label>
            <button className="btn btn-secondary btn-sm" style={{ marginBottom: 0 }} disabled={settingLeave} onClick={handleSetLeave}>
              {settingLeave ? <><span className="spinner" /> Setting…</> : 'Mark as leave'}
            </button>
          </div>
          {leaves.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {leaves.map((l) => (
                <span key={l.leave_date} className="badge badge-warn" style={{ gap: 6 }}>
                  🏖️ {fmtDate(l.leave_date)}
                  <button onClick={() => handleRemoveLeave(l.leave_date)}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--warn)', fontSize: 12, padding: 0 }}>✕</button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── All appointments table ───────────────────────────────────────────────── */
function AppointmentsTab() {
  const [appts, setAppts] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => { getAppointments().then(setAppts).catch(() => {}); }, []);

  const filtered = appts.filter((a) => filter === 'all' || a.status === filter);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {['all', 'confirmed', 'completed', 'cancelled'].map((f) => (
          <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter(f)} style={{ textTransform: 'capitalize' }}>{f}</button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-faint)' }}>No appointments found.</div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="tbl">
            <thead><tr>
              {['Patient', 'Doctor', 'Date', 'Time', 'Status', 'Urgency', 'Pre-visit AI'].map((h) => <th key={h}>{h}</th>)}
            </tr></thead>
            <tbody>
              {filtered.sort((a, b) => (a.appt_date + a.appt_time > b.appt_date + b.appt_time ? -1 : 1)).map((a) => (
                <tr key={a.id}>
                  <td>{a.patient_name}</td>
                  <td>{a.doctor_name}</td>
                  <td>{fmtDate(a.appt_date)}</td>
                  <td>{fmtTime(a.appt_time)}</td>
                  <td><StatusBadge status={a.status} /></td>
                  <td>{a.urgency_level ? <UrgencyBadge level={a.urgency_level} /> : '—'}</td>
                  <td>{a.chief_complaint
                    ? <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>{a.chief_complaint.slice(0, 50)}{a.chief_complaint.length > 50 ? '…' : ''}</span>
                    : <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>Pending</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Email log + reminders ────────────────────────────────────────────────── */
function OpsTab() {
  const [emails, setEmails]       = useState([]);
  const [reminders, setReminders] = useState([]);
  const [emailFilter, setEmailFilter] = useState('');

  useEffect(() => {
    getEmailLog(emailFilter || undefined).then(setEmails).catch(() => {});
    getReminders().then(setReminders).catch(() => {});
  }, [emailFilter]);

  const statusColor = { sent: 'badge-ok', failed: 'badge-danger', queued: 'badge-warn' };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {/* Email log */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 700 }}>Email delivery log</div>
          <select className="select" value={emailFilter} onChange={(e) => setEmailFilter(e.target.value)} style={{ width: 130, fontSize: 12 }}>
            <option value="">All statuses</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="queued">Queued</option>
          </select>
        </div>
        {emails.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-faint)', fontSize: 13 }}>No emails yet.</div>
        ) : (
          <div style={{ maxHeight: 440, overflowY: 'auto', display: 'grid', gap: 8 }}>
            {emails.map((e) => (
              <div key={e.id} className="card-sunken" style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{e.subject}</div>
                  <span className={`badge ${statusColor[e.status] || 'badge-neutral'}`}>{e.status}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>To: {e.to_email}</div>
                {e.email_type && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>{e.email_type} · {e.attempts} attempt(s)</div>}
                {e.error_message && <div style={{ fontSize: 11.5, color: 'var(--danger)', marginTop: 4 }}>{e.error_message}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Medication reminders */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Medication reminder queue</div>
        {reminders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-faint)', fontSize: 13 }}>
            Reminders are scheduled after prescriptions are added.
          </div>
        ) : (
          <div style={{ maxHeight: 440, overflowY: 'auto', display: 'grid', gap: 8 }}>
            {reminders.map((r) => (
              <div key={r.id} className="card-sunken" style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{r.drug_name}</div>
                  <span className={`badge ${r.sent ? 'badge-ok' : 'badge-neutral'}`}>{r.sent ? 'sent' : 'queued'}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{r.patient_name} · {fmtDate(r.remind_date)}</div>
                <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>{r.frequency}{r.dosage ? ` · ${r.dosage}` : ''}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── shared ──────────────────────────────────────────────────────────────── */
function StatusBadge({ status }) {
  const map = { confirmed: ['badge-primary','Confirmed'], completed: ['badge-ok','Completed'], cancelled: ['badge-danger','Cancelled'] };
  const [cls, label] = map[status] || ['badge-neutral', status];
  return <span className={`badge ${cls}`}>{label}</span>;
}
function UrgencyBadge({ level }) {
  const map = { High: 'badge-danger', Medium: 'badge-warn', Low: 'badge-ok' };
  return <span className={`badge ${map[level] || 'badge-neutral'}`}>{level}</span>;
}
function tomorrow() {
  const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10);
}
function fmtDate(d) {
  if (!d) return ''; return new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.slice(0,5).split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
