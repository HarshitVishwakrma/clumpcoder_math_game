const mongoose = require('mongoose');
const bcrypt = require('bcrypt');


const playerSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  // we'll store a bcrypt‑hashed password here
  password: {
    type: String,
    required: true,
    minlength: 6,
  },
  country: {
    type: String,
    required: false,
    trim: true,
  },
  dateOfBirth: {
    type: Date,
    required: false,
  },
  // "PR" = personal record / high score
  pr: {
    practice: {
      easy:   { type: Number, default: 1000 },
      medium: { type: Number, default: 1000 },
      hard:   { type: Number, default: 1000 },
    },
    pvp: {
      easy:   { type: Number, default: 1000 },
      medium: { type: Number, default: 1000 },
      hard:   { type: Number, default: 1000 },
    }
  }
}, { timestamps: true });



playerSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare plaintext password
playerSchema.methods.comparePassword = function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};


module.exports = mongoose.model('Player', playerSchema);
