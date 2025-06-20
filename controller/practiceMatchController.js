const Player = require("../models/Player");

// Practice session logic (unchanged but with better error handling)
function calculatePracticePoints({
  correctCount,
  skippedCount,
  incorrectCount,
}) {
  let pointsA = correctCount - incorrectCount;
  pointsA = Math.max(-10, Math.min(10, pointsA));
  const bonus = (incorrectCount === 0 ? 1 : 0) + (skippedCount === 0 ? 1 : 0);
  return pointsA + bonus;
}

/**
 * POST /api/practice/end
 * Body: { playerId, difficulty, correctCount, incorrectCount, skippedCount }
 */
exports.endPracticeSession = async (req, res) => {
  const { difficulty, correctCount, incorrectCount, skippedCount } = req.body;

  const playerId = req.user._id;
  console.log(playerId);

  if (!playerId || !["easy", "medium", "hard"].includes(difficulty)) {
    return res.status(400).json({ message: "Missing or invalid fields" });
  }

  if (
    typeof correctCount !== "number" ||
    typeof incorrectCount !== "number" ||
    typeof skippedCount !== "number"
  ) {
    return res.status(400).json({ message: "Count fields must be numbers" });
  }

  try {
    const player = await Player.findById(playerId);
    if (!player) return res.status(404).json({ message: "Player not found" });

    // Initialize PR if not exists
    if (!player.pr) player.pr = { practice: {}, pvp: {} };
    if (!player.pr.practice) player.pr.practice = {};

    const points = calculatePracticePoints({
      correctCount,
      skippedCount,
      incorrectCount,
    });
    const currentRating = player.pr.practice[difficulty];
    const newRating = currentRating + points;

    player.pr.practice[difficulty] = newRating;
    await player.save();

    return res.json({
      message: "Practice session ended",
      pointsEarned: points,
      newRating: newRating,
      oldRating: currentRating,
    });
  } catch (err) {
    console.error("Error ending practice session:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
