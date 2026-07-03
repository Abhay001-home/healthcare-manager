const { mongoose } = require('../config/db');

const emailLogSchema = new mongoose.Schema({
  to_email:       { type: String, required: true },
  subject:        { type: String, required: true },
  body_text:      { type: String },
  body_html:      { type: String },
  appointment_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
  email_type:     { type: String }, // booking_confirmation | cancellation | reminder | post_visit | medication_reminder
  status:         { type: String, enum: ['queued', 'sent', 'failed'], default: 'queued' },
  attempts:       { type: Number, default: 0 },
  last_attempted: { type: Date },
  error_message:  { type: String },
}, { timestamps: true });

emailLogSchema.index({ status: 1, attempts: 1 });
emailLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('EmailLog', emailLogSchema);
