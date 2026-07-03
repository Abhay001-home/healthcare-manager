const { mongoose } = require('../config/db');

/* ── Embedded sub-schemas ───────────────────────────────────────────────── */

const symptomFormSchema = new mongoose.Schema({
  symptom_text:  { type: String, required: true },
  duration_days: { type: Number, default: 1 },
  submitted_at:  { type: Date, default: Date.now },
}, { _id: false });

const prescriptionSchema = new mongoose.Schema({
  drug_name:     { type: String, required: true },
  dosage:        { type: String },
  frequency:     { type: String, default: 'Once daily' },
  duration_days: { type: Number, default: 1 },
  notes:         { type: String },
}, { _id: true });

const preVisitSummarySchema = new mongoose.Schema({
  urgency_level:       { type: String, enum: ['Low', 'Medium', 'High', null], default: null },
  chief_complaint:     { type: String },
  suggested_questions: { type: [String], default: [] },
  raw_prompt:          { type: String },
  raw_response:        { type: String },
  model_used:          { type: String },
  error:               { type: String },     // graceful fallback message
  generated_at:        { type: Date, default: Date.now },
}, { _id: false });

const postVisitSummarySchema = new mongoose.Schema({
  patient_summary:     { type: String },
  medication_schedule: { type: mongoose.Schema.Types.Mixed, default: [] },
  follow_up_advice:    { type: String },
  raw_prompt:          { type: String },
  raw_response:        { type: String },
  model_used:          { type: String },
  error:               { type: String },
  generated_at:        { type: Date, default: Date.now },
}, { _id: false });

const visitNotesSchema = new mongoose.Schema({
  notes:        { type: String, required: true },
  submitted_at: { type: Date, default: Date.now },
}, { _id: false });

/* ── Main appointment schema ────────────────────────────────────────────── */

const appointmentSchema = new mongoose.Schema({
  patient_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  doctor_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  appt_date:   { type: String, required: true },   // YYYY-MM-DD  (string for easy index)
  appt_time:   { type: String, required: true },   // HH:MM

  status: {
    type: String,
    enum: ['held', 'confirmed', 'completed', 'cancelled', 'no_show'],
    default: 'held',
  },

  // Slot hold
  hold_expires_at: { type: Date },

  // Google Calendar event IDs
  patient_cal_event_id: { type: String },
  doctor_cal_event_id:  { type: String },

  // Embedded documents (1-to-1 with appointment)
  symptom_form:     { type: symptomFormSchema },
  prescriptions:    { type: [prescriptionSchema], default: [] },
  visit_notes:      { type: visitNotesSchema },
  pre_visit_summary:  { type: preVisitSummarySchema },
  post_visit_summary: { type: postVisitSummarySchema },

}, { timestamps: true });

/* ── Indexes ────────────────────────────────────────────────────────────── */

// The core double-booking guard — unique per (doctor, date, time) for active slots.
// MongoDB partial index equivalent using partialFilterExpression.
appointmentSchema.index(
  { doctor_id: 1, appt_date: 1, appt_time: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $nin: ['cancelled', 'no_show'] },
    },
    name: 'uix_appointment_slot',
  }
);

appointmentSchema.index({ patient_id: 1 });
appointmentSchema.index({ doctor_id: 1 });
appointmentSchema.index({ appt_date: 1 });
appointmentSchema.index({ status: 1 });
appointmentSchema.index({ hold_expires_at: 1 }, { sparse: true });

module.exports = mongoose.model('Appointment', appointmentSchema);
