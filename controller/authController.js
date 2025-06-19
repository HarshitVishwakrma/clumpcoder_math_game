const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt')

const Player = require('../models/Player');

// POST /api/auth/signup
exports.signup = async (req, res) => {
  const { username, email, password, country, dateOfBirth } = req.body;
  try {
    // 1. Check for existing email or username
    let existing = await Player.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'Email already in use' });
    }
    existing = await Player.findOne({ username });
    if (existing) {
      return res.status(400).json({ message: 'Username already taken' });
    }

    console.log('Original password:', password); // Debug log

    // 2. Create player (password will be hashed by schema middleware)
    const player = new Player({
      username,
      email,
      password, // Don't hash here - let the schema pre-save middleware do it
      country,
      dateOfBirth,
    });
    await player.save();

    console.log('Stored password hash:', player.password); // Debug log

    // 3. Issue JWT
    const token = jwt.sign(
      { id: player._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // 4. Respond (omit password)
    res.status(201).json({
      token,
      player: {
        id: player._id,
        username: player.username,
        email: player.email,
        country: player.country,
        dateOfBirth: player.dateOfBirth,
        pr: player.pr
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /api/auth/login
exports.login = async (req, res) => {
  const { email, password } = req.body;
  try {
    console.log('Login attempt with password:', password); // Debug log

    // 1. Find player by email
    const player = await Player.findOne({ email });
    if (!player) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    console.log('Stored hash in DB:', player.password); // Debug log

    // 2. Compare password using the schema method
    const isMatch = await player.comparePassword(password);
    console.log('Password match result:', isMatch); // Debug log

    // Also try direct bcrypt comparison for debugging
    const directMatch = await bcrypt.compare(password, player.password);
    console.log('Direct bcrypt comparison:', directMatch); // Debug log

    if (!isMatch) {
      console.log('password not matched')
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // 3. Issue JWT
    const token = jwt.sign(
      { id: player._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // 4. Respond
    res.json({
      token,
      player: {
        id: player._id,
        username: player.username,
        email: player.email,
        country: player.country,
        dateOfBirth: player.dateOfBirth,
        pr: player.pr
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};