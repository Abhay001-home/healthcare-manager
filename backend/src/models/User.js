const { mongoose } = require('../config/db');

const userSchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true },
  email:         { type: String, required: true, unique: true, lowercase: true, trim: true },
  password_hash: { type: String, required: true },
  role:          { type: String, required: true, enum: ['patient', 'doctor', 'admin'] },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
