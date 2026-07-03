const { mongoose } = require('../config/db');

const medicationReminderSchema = new mongoose.Schema({
  appointment_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true },
  patient_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  prescription_id: { type: mongoose.Schema.Types.ObjectId }, // embedded prescription _id
  remind_date:     { type: String, required: true }, // YYYY-MM-DD
  drug_name:       { type: String, required: true },
  dosage:          { type: String },
  frequency:       { type: String, required: true },
  sent:            { type: Boolean, default: false },
  sent_at:         { type: Date },
}, { timestamps: true });

medicationReminderSchema.index({ remind_date: 1, sent: 1 });
medicationReminderSchema.index({ patient_id: 1 });

module.exports = mongoose.model('MedicationReminder', medicationReminderSchema);
