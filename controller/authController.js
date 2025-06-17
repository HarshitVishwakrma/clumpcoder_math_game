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

    // 2. Hash password
    const salt     = await bcrypt.genSalt(10);
    const hashPass = await bcrypt.hash(password, salt);

    // 3. Create player
    const player = new Player({
      username,
      email,
      password: hashPass,
      country,
      dateOfBirth,
      // pr defaults already set by schema
    });
    await player.save();

    // 4. Issue JWT
    const token = jwt.sign(
      { id: player._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // 5. Respond (omit password)
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
    // 1. Find player by email
    const player = await Player.findOne({ email });
    if (!player) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // 2. Compare password
    const isMatch = await bcrypt.compare(password, player.password);
    if (!isMatch) {
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