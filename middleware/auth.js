const jwt = require('jsonwebtoken');
const Player = require('../models/Player');

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    // Verify token and extract payload
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Attach player to request
    const player = await Player.findById(payload.id).select('-password');
    if (!player) {
      return res.status(401).json({ message: 'Player not found' });
    }
    req.user = player;
    next();
  } catch (err) {
    console.error('Auth error:', err);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};
