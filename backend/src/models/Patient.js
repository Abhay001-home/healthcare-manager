const { mongoose } = require('../config/db');

const patientSchema = new mongoose.Schema({
  _id:            { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // same _id as User
  date_of_birth:  { type: Date },
  phone:          { type: String },
  blood_group:    { type: String },
  allergies:      { type: String },
  calendar_tokens:{ type: String }, // AES-256-CBC encrypted JSON
}, { timestamps: true, _id: false });

// Allow setting _id explicitly (so we can share it with User)
patientSchema.set('id', false);

module.exports = mongoose.model('Patient', patientSchema);
