# 🏥 Healthcare Appointment & Follow-up Manager

A full-stack healthcare platform with separate portals for **patients**, **doctors**, and **admin**.  
Built with **Node.js + Express + MongoDB (Mongoose)** on the backend and **React + Vite** on the frontend.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Quick Start](#quick-start)
3. [Environment Variables](#environment-variables)
4. [Database Schema (Mongoose Models)](#database-schema-mongoose-models)
5. [API Reference](#api-reference)
6. [LLM Prompts](#llm-prompts)
7. [Google Calendar Setup](#google-calendar-setup)
8. [Email Setup](#email-setup)
9. [Deployment Guide](#deployment-guide)
10. [System Design](#system-design)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 18+, Express 4 |
| Database | **MongoDB** with **Mongoose 8** ODM |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| LLM | Anthropic Claude (claude-sonnet-4-6) |
| Email | Nodemailer (SMTP / SendGrid) |
| Calendar | Google Calendar API v3 (OAuth 2.0) |
| Background jobs | node-cron |
| Frontend | React 18, Vite, React Router v6 |
| HTTP client | Axios |

---

## Quick Start

### Prerequisites
- **Node.js ≥ 18**
- **MongoDB** running locally on `mongodb://localhost:27017`  

### 1. Install dependencies

```bash
cd healthcare-manager

# Backend
cd backend && npm install

# Frontend (new terminal)
cd ../frontend && npm install
```

### 2. Configure environment

```bash
cd backend
cp .env.example .env
# Open .env and fill in all required values
```

### 3. Seed demo data

```bash
cd backend
npm run seed
```

MongoDB collections and indexes are created automatically by Mongoose on first connection — no migration script needed.

### 4. Start both servers

```bash
# Terminal 1 — backend (http://localhost:4000)
cd backend && npm run dev

# Terminal 2 — frontend (http://localhost:3000)
cd ../frontend && npm run dev
```

### 5. Demo credentials

| Role    | Email                   | Password   |
|---------|-------------------------|------------|
| Patient | aman@mail.test          | patient123 |
| Patient | sana@mail.test          | patient123 |
| Doctor  | meera@clinic.test       | doctor123  |
| Doctor  | rahul@clinic.test       | doctor123  |
| Admin   | admin@clinic.test       | admin123   |

---

## Environment Variables

Full reference for `backend/.env`:

```bash
# ── MongoDB ─────────────────────────────────────────────────────────────────
# Local:
MONGODB_URI=mongodb://localhost:27017/healthcare_db
# Atlas (cloud):
# MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/healthcare_db

# ── Server ───────────────────────────────────────────────────────────────────
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# ── Auth ─────────────────────────────────────────────────────────────────────
# Generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=your_64_char_hex_secret
JWT_EXPIRES_IN=7d

# ── Anthropic ─────────────────────────────────────────────────────────────────
# https://console.anthropic.com/settings/keys
ANTHROPIC_API_KEY=sk-ant-api03-REPLACE_ME
ANTHROPIC_MODEL=claude-sonnet-4-6

# ── Email (Gmail SMTP) ───────────────────────────────────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@gmail.com
SMTP_PASS=your-16-char-app-password   # Gmail → Account → Security → App Passwords
MAIL_FROM="Meridian Clinic <you@gmail.com>"

# ── Email (SendGrid alternative) ─────────────────────────────────────────────
# SENDGRID_API_KEY=SG.REPLACE_ME

# ── Google Calendar ──────────────────────────────────────────────────────────
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxx
GOOGLE_REDIRECT_URI=http://localhost:4000/api/calendar/oauth/callback
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
TOKEN_ENCRYPTION_KEY=your_32_byte_hex_key

# ── Misc ──────────────────────────────────────────────────────────────────────
SLOT_HOLD_SECONDS=120
REMINDER_CRON=0 8 * * *
LOG_LEVEL=info
```

---

## Database Schema (Mongoose Models)

All models live in `backend/src/models/`. Mongoose auto-creates collections and indexes on first connection.

### Collections & embedded structure

```
users               — base auth (name, email, password_hash, role)
patients            — shares _id with users (phone, blood_group, calendar_tokens)
doctors             — shares _id with users (specialisation, working_start/end,
│                     slot_duration, calendar_tokens)
│                     leaves: [{ leave_date, reason }]  ← embedded array
│
appointments        — core booking document
│   status: held | confirmed | completed | cancelled | no_show
│   ── Embedded sub-documents (all 1-to-1 with appointment):
│   symptom_form:        { symptom_text, duration_days }
│   visit_notes:         { notes, submitted_at }
│   prescriptions:       [{ drug_name, dosage, frequency, duration_days }]
│   pre_visit_summary:   { urgency_level, chief_complaint, suggested_questions,
│                          raw_prompt, raw_response, model_used, error }
│   post_visit_summary:  { patient_summary, medication_schedule,
│                          follow_up_advice, raw_prompt, raw_response, error }
│
email_log           — every outbound email with status + retry tracking
medication_reminders— one document per drug per day of prescription course
```

### Key index — double-booking prevention

```javascript
// In Appointment model
appointmentSchema.index(
  { doctor_id: 1, appt_date: 1, appt_time: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $nin: ['cancelled', 'no_show'] } },
    name: 'uix_appointment_slot',
  }
);
```

This MongoDB partial unique index is the database-level guard: two documents with the same `(doctor_id, appt_date, appt_time)` and an active status cannot coexist. Any race condition that slips past the application-level hold will hit this and return a `MongoServerError` code `11000`, which the route catches and converts into a user-friendly 409 response.

---

## API Reference

All endpoints are prefixed `/api`. Protected routes need `Authorization: Bearer <token>`.

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | — | Register (role: patient/doctor/admin) |
| POST | `/api/auth/login` | — | Sign in, returns JWT |
| GET | `/api/auth/me` | ✅ | Current user |

### Doctors

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/doctors` | — | List all (optional `?specialisation=`) |
| GET | `/api/doctors/specialisations` | — | Distinct list |
| GET | `/api/doctors/:id` | — | Profile |
| GET | `/api/doctors/:id/availability?date=YYYY-MM-DD` | — | Available time slots |
| PUT | `/api/doctors/:id` | ✅ doctor/admin | Update profile |
| GET | `/api/doctors/:id/leaves` | — | Leave dates |

### Appointments (2-step booking)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/appointments/hold` | ✅ patient | Acquire slot hold (120 s) |
| POST | `/api/appointments/confirm` | ✅ patient | Submit symptoms + confirm |
| GET | `/api/appointments` | ✅ any | My appointments (role-scoped) |
| GET | `/api/appointments/:id` | ✅ any | Full appointment detail |
| DELETE | `/api/appointments/:id` | ✅ any | Cancel |
| POST | `/api/appointments/:id/pre-visit-summary` | ✅ doctor/admin | (Re)generate AI pre-visit |
| POST | `/api/appointments/:id/post-visit` | ✅ doctor | Notes + Rx → AI summary + emails |

**Hold body:**
```json
{ "doctor_id": "...", "appt_date": "2025-08-15", "appt_time": "09:00" }
```
**Confirm body:**
```json
{ "hold_id": "...", "symptom_text": "Persistent headache...", "duration_days": 3 }
```
**Post-visit body:**
```json
{
  "notes": "Tension headache. BP normal.",
  "prescriptions": [
    { "drug_name": "Ibuprofen", "dosage": "400mg", "frequency": "Twice daily", "duration_days": 5 }
  ]
}
```

### Admin

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/stats` | Dashboard counts |
| GET/POST | `/api/admin/doctors` | List / create doctors |
| PUT | `/api/admin/doctors/:id` | Edit doctor |
| POST | `/api/admin/doctors/:id/leave` | Set leave → auto-cancel + notify |
| DELETE | `/api/admin/doctors/:id/leave/:date` | Remove leave |
| GET | `/api/admin/email-log` | Email delivery log |
| GET | `/api/admin/reminders` | Medication reminder queue |
| GET | `/api/admin/patients` | All patients |

### Google Calendar

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/calendar/auth-url` | ✅ | OAuth consent URL |
| GET | `/api/calendar/oauth/callback` | — | Google redirect handler |
| GET | `/api/calendar/status` | ✅ | Calendar connected? |

---

## LLM Prompts

### Pre-visit prompt
```
Symptoms: {symptom_text}
Duration: {duration_days} day(s)
→ Returns JSON: { urgency_level, chief_complaint, suggested_questions[3] }
```

### Post-visit prompt
```
Clinical Notes: {notes}
Prescription: {list}
→ Returns JSON: { patient_summary, medication_schedule[], follow_up_advice }
```

Both prompts handle failures gracefully: on any error the system returns a fallback object, stores the error in the embedded `pre_visit_summary.error` / `post_visit_summary.error` field, and never blocks the booking flow.

---

## Google Calendar Setup

1. [console.cloud.google.com](https://console.cloud.google.com) → New project
2. **APIs & Services → Library** → Enable **Google Calendar API**
3. **APIs & Services → Credentials** → Create Credentials → **OAuth 2.0 Client ID**
4. Application type: **Web application**
5. Authorised redirect URIs:
   - Dev: `http://localhost:4000/api/calendar/oauth/callback`
   - Prod: `https://your-api.onrender.com/api/calendar/oauth/callback`
6. Copy **Client ID** and **Client Secret** → paste into `.env`
7. **OAuth consent screen** → add scope `https://www.googleapis.com/auth/calendar.events`
8. Generate `TOKEN_ENCRYPTION_KEY`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

---

## Email Setup (Gmail)

1. Enable 2-Step Verification on your Google Account
2. Go to **Account → Security → App Passwords**
3. Select **Mail** → Generate → copy the 16-character password
4. Set in `.env`:
   ```
   SMTP_USER=you@gmail.com
   SMTP_PASS=xxxx xxxx xxxx xxxx
   ```

---

## Deployment Guide

### Backend → Render

1. Push to GitHub
2. Render → New Web Service → connect repo → Root dir: `backend`
3. Build: `npm install`  Start: `npm start`
4. Add all `.env` values in Render dashboard
5. For MongoDB: use [MongoDB Atlas](https://www.mongodb.com/atlas) free tier → copy connection string into `MONGODB_URI`

### Frontend → Vercel

1. Vercel → New Project → import repo → Root dir: `frontend`
2. Framework: **Vite**
3. Add env var: `VITE_API_BASE_URL=https://your-render-backend.onrender.com`
4. Update backend `FRONTEND_URL` to your Vercel URL

---

## System Design

See `SYSTEM_DESIGN.md` for the full 800-word write-up covering double-booking prevention, doctor leave conflict handling, slot hold mechanism, and notification failure handling.

---

## Project Structure

```
healthcare-manager/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js           # Mongoose connection
│   │   │   └── logger.js       # Winston
│   │   ├── models/             # ★ All Mongoose schemas
│   │   │   ├── User.js
│   │   │   ├── Patient.js
│   │   │   ├── Doctor.js       # With embedded leaves[]
│   │   │   ├── Appointment.js  # With all embedded sub-docs
│   │   │   ├── EmailLog.js
│   │   │   └── MedicationReminder.js
│   │   ├── middleware/
│   │   │   ├── auth.js         # JWT verify + requireRole
│   │   │   └── errorHandler.js
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── doctors.js
│   │   │   ├── appointments.js # 2-step hold→confirm, pre/post-visit
│   │   │   ├── admin.js
│   │   │   └── calendar.js
│   │   ├── services/
│   │   │   ├── llm.js          # Anthropic API + fallback
│   │   │   ├── email.js        # Nodemailer + retry + builders
│   │   │   └── calendar.js     # Google Calendar OAuth + CRUD
│   │   ├── jobs/
│   │   │   └── scheduler.js    # node-cron: reminders, retry, hold cleanup
│   │   ├── db/
│   │   │   └── seed.js         # Demo data (no migration needed with Mongo)
│   │   └── index.js            # Express app entry point
│   ├── .env.example
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── context/AuthContext.jsx
    │   ├── utils/api.js
    │   ├── components/Shell.jsx
    │   └── pages/
    │       ├── LoginPage.jsx
    │       ├── PatientPortal.jsx
    │       ├── DoctorPortal.jsx
    │       ├── AdminPortal.jsx
    │       └── CalendarConnected.jsx
    ├── App.jsx  main.jsx  index.css
    ├── index.html
    └── vite.config.js
```
