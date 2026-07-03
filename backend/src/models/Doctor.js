const { mongoose } = require('../config/db');

const leaveSchema = new mongoose.Schema({
  leave_date: { type: String, required: true }, // YYYY-MM-DD
  reason:     { type: String },
}, { _id: true, timestamps: true });

const doctorSchema = new mongoose.Schema({
  _id:             { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  specialisation:  { type: String, required: true },
  qualification:   { type: String },
  working_start:   { type: String, default: '09:00' }, // HH:MM
  working_end:     { type: String, default: '17:00' },
  slot_duration:   { type: Number, default: 20, min: 5 },
  calendar_tokens: { type: String }, // AES-256-CBC encrypted JSON
  leaves:          { type: [leaveSchema], default: [] },
}, { timestamps: true, _id: false });

doctorSchema.set('id', false);

// Virtual: check if a date string is a leave date
doctorSchema.methods.isOnLeave = function (dateStr) {
  return this.leaves.some((l) => l.leave_date === dateStr);
};

module.exports = mongoose.model('Doctor', doctorSchema);
