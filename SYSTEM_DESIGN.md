# System Design Write-up
## Healthcare Appointment & Follow-up Manager

---

### 1. Double-Booking Prevention

The most critical correctness requirement in any booking system is that two patients cannot occupy the same doctor slot simultaneously. This is solved at two levels, working together as defence-in-depth.

**Application level — slot hold mechanism (see section 3).**
Before a patient sees the symptom form, the system acquires a temporary database row for the slot with `status = 'held'`. This optimistically claims the slot while the patient completes the form, preventing the window between "slot selected" and "booking confirmed" from being a race condition.

**Database level — partial unique index.**
The definitive guard is a PostgreSQL partial unique index:

```sql
CREATE UNIQUE INDEX uix_appointment_slot
  ON appointments (doctor_id, appt_date, appt_time)
  WHERE status NOT IN ('cancelled', 'no_show');
```

This means the database itself will raise a `unique_violation` (error code `23505`) if two rows ever try to claim the same `(doctor_id, date, time)` with an active status, regardless of whether they arrived from the same server process, two concurrent requests, or two horizontally-scaled instances. The application catches this error and returns a user-friendly "slot just taken" message. The index excludes cancelled and no-show rows so those slots become bookable again.

**Why both layers?**
The hold covers the user-experience gap (patron fills a form for 60–90 seconds — the slot should feel "theirs"). The index covers the atomicity gap (two requests could both read "slot free" before either writes — the DB constraint makes exactly one of them succeed). Together they handle every race condition at any scale.

---

### 2. Doctor Leave Conflict Handling

When an admin marks a doctor on leave for a date that already has confirmed bookings, the system must:

1. Record the leave without disrupting in-flight requests.
2. Identify every `confirmed` or `held` appointment on that date for that doctor.
3. Cancel each one atomically.
4. Notify the affected patients and remove their calendar events.
5. Do all of this without holding a long database transaction that would block concurrent reads.

**Implementation flow (`POST /api/admin/doctors/:id/leave`):**

```
INSERT INTO doctor_leaves (doctor_id, leave_date) ON CONFLICT DO NOTHING
SELECT affected appointments
FOR EACH affected appointment:
  UPDATE status = 'cancelled'
  send leaveNotificationEmail (fire-and-forget)
  deleteCalendarEvent for patient (fire-and-forget)
  deleteCalendarEvent for doctor  (fire-and-forget)
```

The `INSERT … ON CONFLICT DO NOTHING` is idempotent — marking the same leave date twice is safe. Email and calendar side-effects are dispatched with `Promise.allSettled` so a transient email failure does not roll back the cancellation. Failed emails are retried by the background job within 15 minutes. The `email_log` table records every attempt, giving the admin full visibility.

For future bookings: the availability endpoint (`GET /api/doctors/:id/availability`) checks `doctor_leaves` before generating slots, so the leave date simply returns `{ available: false }` and the UI shows no slots.

---

### 3. Slot Hold Mechanism

The booking flow is split into two API calls:

**Step 1 — `POST /api/appointments/hold`**
Inserts a row with `status = 'held'` and `hold_expires_at = NOW() + SLOT_HOLD_SECONDS`. The partial unique index immediately prevents any other patient from claiming the same slot. Returns a `hold_id` to the client.

**Step 2 — `POST /api/appointments/confirm`**
The client submits the symptom form with the `hold_id`. The server:
- Verifies the hold belongs to this patient.
- Checks `hold_expires_at > NOW()` — if expired, cancels the hold and asks the patient to re-select.
- Atomically updates `status = 'confirmed'` and inserts the symptom form in a single database transaction.
- Fires all side-effects (AI summary, emails, calendar events) asynchronously.

**Hold expiry cleanup — background job (every 2 minutes):**
```sql
UPDATE appointments SET status = 'cancelled'
WHERE status = 'held' AND hold_expires_at < NOW();
```
This ensures a patient who abandons checkout does not lock a slot forever. The window is configurable via `SLOT_HOLD_SECONDS` (default: 120 seconds). In production this can be tuned per doctor's average form-completion time.

**Why not a Redis lock?**
PostgreSQL's partial unique index provides the same mutual exclusion guarantee without adding an infrastructure dependency. The hold row also gives audit visibility (we know when a slot was held and for how long) which a Redis key would not. For very high-throughput systems (thousands of concurrent bookings per second), a Redis-based distributed lock would be appropriate, but for a clinic-scale product PostgreSQL handles it cleanly.

---

### 4. Notification Failure Handling

Notifications (email + Google Calendar) are critical for user experience but must never block or fail a booking. The system uses three strategies:

**Fire-and-forget with `Promise.allSettled`**
Every booking confirmation, cancellation, and post-visit summary dispatches its side-effects in a `Promise.allSettled` call. This means all effects are attempted in parallel, failures are logged, but the primary API response is not affected. A broken SMTP server cannot prevent a patient from booking.

**Persistent email queue with retry**
Every outbound email is written to `email_log` with `status = 'queued'` *before* being sent. After the SMTP attempt, status is updated to `sent` or `failed`. A background cron job runs every 15 minutes:

```
SELECT FROM email_log WHERE status = 'failed' AND attempts < 3
FOR EACH: retry sendMail, update attempts, update status
```

After 3 failed attempts the email is left as `failed` and surfaced in the admin ops dashboard. This gives the admin visibility and the ability to investigate SMTP configuration. The `attempts` counter and `error_message` field capture the full failure history.

**Google Calendar graceful degradation**
Calendar operations (create/update/delete) are wrapped in try-catch and return `null` on failure rather than throwing. A missing or expired OAuth token — the most common failure mode — is detected early (`getCalendarClient` returns `null` when no tokens are stored) and the booking proceeds without a calendar event. The user can reconnect their calendar at any time and new bookings will resume creating events. Existing bookings without events are not retroactively synced (a scheduled reconciliation job could be added if needed).

**LLM summary failures**
Both the pre-visit and post-visit AI calls are wrapped in try-catch. On failure:
- The raw error is stored in `llm_summaries.raw_response` for debugging.
- A graceful fallback object is returned (pre-visit: no urgency/questions; post-visit: plain prescription text).
- The appointment status is updated normally (`confirmed` or `completed`).
- The doctor can trigger a retry from the portal.
- The system never returns a 500 error to the client due to an LLM timeout.

This layered approach means the three external dependencies (Anthropic, email SMTP, Google Calendar) can all fail simultaneously and the core booking system continues to function correctly.
---
