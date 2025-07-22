const mongoose = require('mongoose');
const { Schema } = mongoose;

const PVPGameSchema = new Schema({
  player1: {
    type: Schema.Types.ObjectId,
    ref: 'Player',
    required: true,
  },
  player2: {
    type: Schema.Types.ObjectId,
    ref: 'Player',
    required: true,
  },
  scorePlayer1: {
    type: Number,
    required: true,
  },
  scorePlayer2: {
    type: Number,
    required: true,
  },
  winner: {
    type: Schema.Types.ObjectId,
    ref: 'Player',
    required: false, // in case of a draw
  },
  result: {
    type: String,
    enum: ['Player1Won', 'Player2Won', 'Draw'],
    required: true,
  },
  gameDuration: {
    type: Number, // in seconds
    required: true,
  },
  playedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('PVPGame', PVPGameSchema);
