/*
src/controllers/matchController.js
Improved version with better rating logic, validation, and cleanup
*/
const { v4: uuidv4 } = require("uuid");
const Player = require("../models/Player");
const {
  loadQuestionsFromExcel,
  getLevelFromScore,
} = require("./questionController");

// In-memory store of rooms with cleanup tracking
const rooms = {};
const roomTimeouts = {};

// Constants for game configuration
const GAME_CONFIG = {
  QUESTIONS_PER_MATCH: 10,
  MATCH_TIMEOUT: 300000, // 5 minutes
  ROUND_TIMEOUT: 60000, // 60 seconds per question
  BASE_RATING: 1000,
  MIN_RATING: 0,
  MAX_RATING_CHANGE: 50,
};

// Level thresholds based on correct answers
const LEVEL_THRESHOLDS = {
  1: 0,
  2: 2,
  3: 4,
  4: 6,
  5: 8,
  6: 10,
  7: 12,
  8: 14,
  9: 16,
  10: 18,
};

/**
 * POST /api/match/challenge
 * Initiates a challenge: validates players and creates a room
 * Body: { fromPlayerId, toPlayerId, difficulty }
 * Returns: { roomId, message }
 */
exports.createChallenge = async (req, res) => {
  try {
    const io = req.app.get("io");
    const { fromPlayerId, toPlayerId, difficulty = "medium" } = req.body;

    // Validation
    if (!fromPlayerId || !toPlayerId) {
      return res
        .status(400)
        .json({ message: "fromPlayerId and toPlayerId required" });
    }

    if (!["easy", "medium", "hard"].includes(difficulty)) {
      return res.status(400).json({ message: "Invalid difficulty level" });
    }

    if (fromPlayerId === toPlayerId) {
      return res.status(400).json({ message: "Cannot challenge yourself" });
    }

    // Verify both players exist
    const [fromPlayer, toPlayer] = await Promise.all([
      Player.findById(fromPlayerId),
      Player.findById(toPlayerId),
    ]);

    if (!fromPlayer || !toPlayer) {
      return res.status(404).json({ message: "One or both players not found" });
    }

    const roomId = uuidv4();
    rooms[roomId] = {
      players: [fromPlayerId, toPlayerId],
      playerNames: {
        [fromPlayerId]: fromPlayer.username,
        [toPlayerId]: toPlayer.username,
      },
      scores: {},
      difficulty,
      level: 1,
      initialized: false,
      responses: {},
      questionCount: 0,
      questionsAsked: [],
      startTime: null,
      currentQuestion: null,
    };

    // Set up room timeout
    roomTimeouts[roomId] = setTimeout(() => {
      cleanupRoom(roomId, "timeout");
    }, GAME_CONFIG.MATCH_TIMEOUT);

    setupSocketForRoom(io, roomId);

    return res.json({
      roomId,
      message: "Challenge created successfully",
      difficulty,
    });
  } catch (error) {
    console.error("Error creating challenge:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Setup socket namespace for a room with improved error handling
 */
function setupSocketForRoom(io, roomId) {
  const nsp = io.of(`/match/${roomId}`);

  nsp.on("connection", (socket) => {
    console.log(`Socket connected to /match/${roomId}:`, socket.id);
    socket.join(roomId);

    const room = rooms[roomId];
    if (!room) {
      socket.emit("error", { message: "Room no longer exists" });
      return;
    }

    // Initialize match when both players connect
    const connectedCount = nsp.sockets.size; // Map#size
    if (!room.initialized && connectedCount === room.players.length) {
      console.log("Both players connected—initializing match");
      initializeMatch(nsp, roomId);
    }

    socket.on("submitAnswer", ({ playerId, answer, timeLeft }) => {
      handleAnswerSubmission(nsp, roomId, playerId, answer, timeLeft);
    });

    socket.on("disconnect", () => {
      console.log(`Socket disconnected from /match/${roomId}:`, socket.id);
      handlePlayerDisconnect(nsp, roomId, socket.id);
    });

    // socket.on('playerReady', ({ playerId }) => {
    //   handlePlayerReady(nsp, roomId, playerId);
    // });
  });
}

function initializeMatch(nsp, roomId) {
  const room = rooms[roomId];
  if (!room) return;
  console.log("match initialized");

  // Initialize scores
  room.players.forEach((id) => (room.scores[id] = 0));
  room.initialized = true;
  room.startTime = Date.now();

  nsp.emit("matchStarted", {
    timer: GAME_CONFIG.ROUND_TIMEOUT / 1000,
    level: room.level,
    difficulty: room.difficulty,
    totalQuestions: GAME_CONFIG.QUESTIONS_PER_MATCH,
    players: room.playerNames,
  });

  sendNextQuestion(nsp, roomId);
}

function sendNextQuestion(nsp, roomId) {
  const room = rooms[roomId];
  if (!room) return;

  try {
    // Determine level based on lowest score (keeps game balanced)
    const minScore = Math.min(...Object.values(room.scores));
    room.level = getLevelFromScore(minScore);

    const allQuestions = loadQuestionsFromExcel();
    const availableQuestions = allQuestions.filter(
      (q) =>
        q.levelNumber === room.level &&
        q.difficulty === room.difficulty &&
        !room.questionsAsked.includes(q.id)
    );

    if (availableQuestions.length === 0) {
      // Fallback to any question of the right difficulty if no unused questions
      const fallbackQuestions = allQuestions.filter(
        (q) => q.difficulty === room.difficulty
      );
      if (fallbackQuestions.length === 0) {
        endMatch(nsp, roomId, "no_questions");
        return;
      }
      room.currentQuestion =
        fallbackQuestions[Math.floor(Math.random() * fallbackQuestions.length)];
    } else {
      room.currentQuestion =
        availableQuestions[
          Math.floor(Math.random() * availableQuestions.length)
        ];
    }

    room.questionsAsked.push(room.currentQuestion.id);
    room.responses = {};

    nsp.emit("newQuestion", {
      question: {
        ...room.currentQuestion,
        answer: undefined, // Don't send answer to client
      },
      level: room.level,
      questionNumber: room.questionCount + 1,
      totalQuestions: GAME_CONFIG.QUESTIONS_PER_MATCH,
    });
  } catch (error) {
    console.error("Error sending question:", error);
    endMatch(nsp, roomId, "error");
  }
}

function handleAnswerSubmission(nsp, roomId, playerId, answer, timeLeft = 0) {
  const room = rooms[roomId];
  if (!room || !room.currentQuestion) return;

  // Prevent duplicate submissions
  if (room.responses[playerId]) return;

  const correct =
    String(answer).trim().toLowerCase() ===
    String(room.currentQuestion.answer).trim().toLowerCase();

  // Award points with time bonus
  let points = 0;
  if (correct) {
    points = 1;
    // Time bonus: up to 0.5 additional points based on speed
    const timeBonus = Math.min(
      0.5,
      (timeLeft / (GAME_CONFIG.ROUND_TIMEOUT / 1000)) * 0.5
    );
    points += timeBonus;
  }

  room.scores[playerId] = (room.scores[playerId] || 0) + points;
  room.responses[playerId] = { answer, correct, points };

  // Check if all players have responded
  if (Object.keys(room.responses).length === room.players.length) {
    processRoundResults(nsp, roomId);
  }
}

function processRoundResults(nsp, roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.questionCount++;

  // Emit round results
  nsp.emit("roundResult", {
    scores: room.scores,
    responses: room.responses,
    correctAnswer: room.currentQuestion.answer,
    questionNumber: room.questionCount,
  });

  // Check if match is complete
  if (room.questionCount >= GAME_CONFIG.QUESTIONS_PER_MATCH) {
    setTimeout(() => endMatch(nsp, roomId, "completed"), 3000); // 3 second delay to show results
  } else {
    setTimeout(() => sendNextQuestion(nsp, roomId), 3000); // 3 second delay between questions
  }
}

/**
 * Enhanced rating calculation with clearer logic
 */
function calculateRatingChanges(playerA, playerB, scoreA, scoreB, difficulty) {
  const ratingA = playerA.pr?.pvp?.[difficulty] || GAME_CONFIG.BASE_RATING;
  const ratingB = playerB.pr?.pvp?.[difficulty] || GAME_CONFIG.BASE_RATING;

  // Basic ELO calculation
  const K = 32; // K-factor
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const expectedB = 1 - expectedA;

  let actualA, actualB;
  if (scoreA > scoreB) {
    actualA = 1;
    actualB = 0; // A wins
  } else if (scoreB > scoreA) {
    actualA = 0;
    actualB = 1; // B wins
  } else {
    actualA = 0.5;
    actualB = 0.5; // Draw
  }

  // Calculate base rating changes
  let deltaA = Math.round(K * (actualA - expectedA));
  let deltaB = Math.round(K * (actualB - expectedB));

  // Performance bonus based on score difference
  const scoreDiff = Math.abs(scoreA - scoreB);
  const performanceBonus = Math.min(10, Math.floor(scoreDiff * 2));

  if (scoreA > scoreB) {
    deltaA += performanceBonus;
    deltaB -= performanceBonus;
  } else if (scoreB > scoreA) {
    deltaB += performanceBonus;
    deltaA -= performanceBonus;
  }

  // Limit maximum rating change
  deltaA = Math.max(
    -GAME_CONFIG.MAX_RATING_CHANGE,
    Math.min(GAME_CONFIG.MAX_RATING_CHANGE, deltaA)
  );
  deltaB = Math.max(
    -GAME_CONFIG.MAX_RATING_CHANGE,
    Math.min(GAME_CONFIG.MAX_RATING_CHANGE, deltaB)
  );

  return { deltaA, deltaB };
}

/**
 * Ends the match with improved rating calculation and cleanup
 */
async function endMatch(nsp, roomId, reason = "completed") {
  const room = rooms[roomId];
  if (!room) return;

  try {
    const [p1, p2] = room.players;
    const score1 = room.scores[p1] || 0;
    const score2 = room.scores[p2] || 0;

    // Determine winner
    let winner = null;
    if (score1 > score2) winner = p1;
    else if (score2 > score1) winner = p2;
    // else it's a draw

    // Get player data
    const [playerA, playerB] = await Promise.all([
      Player.findById(p1),
      Player.findById(p2),
    ]);

    if (!playerA || !playerB) {
      console.error("Players not found during match end");
      cleanupRoom(roomId, "player_not_found");
      return;
    }

    // Initialize PR if not exists
    if (!playerA.pr) playerA.pr = { practice: {}, pvp: {} };
    if (!playerB.pr) playerB.pr = { practice: {}, pvp: {} };
    if (!playerA.pr.pvp) playerA.pr.pvp = {};
    if (!playerB.pr.pvp) playerB.pr.pvp = {};

    const difficulty = room.difficulty;
    playerA.pr.pvp[difficulty] =
      playerA.pr.pvp[difficulty] || GAME_CONFIG.BASE_RATING;
    playerB.pr.pvp[difficulty] =
      playerB.pr.pvp[difficulty] || GAME_CONFIG.BASE_RATING;

    // Calculate rating changes
    const { deltaA, deltaB } = calculateRatingChanges(
      playerA,
      playerB,
      score1,
      score2,
      difficulty
    );

    // Apply rating changes
    const newRatingA = Math.max(
      GAME_CONFIG.MIN_RATING,
      playerA.pr.pvp[difficulty] + deltaA
    );
    const newRatingB = Math.max(
      GAME_CONFIG.MIN_RATING,
      playerB.pr.pvp[difficulty] + deltaB
    );

    playerA.pr.pvp[difficulty] = newRatingA;
    playerB.pr.pvp[difficulty] = newRatingB;

    // Save to database
    await Promise.all([playerA.save(), playerB.save()]);

    // Emit match results
    nsp.emit("matchEnded", {
      reason,
      scores: room.scores,
      winner,
      ratingDeltas: { [p1]: deltaA, [p2]: deltaB },
      newRatings: { [p1]: newRatingA, [p2]: newRatingB },
      matchDuration: room.startTime ? Date.now() - room.startTime : 0,
    });

    // Cleanup
    cleanupRoom(roomId, reason);
  } catch (error) {
    console.error("Error ending match:", error);
    cleanupRoom(roomId, "error");
  }
}

function handlePlayerDisconnect(nsp, roomId, socketId) {
  const room = rooms[roomId];
  if (!room) return;

  // If match hasn't started yet or is in progress, end it due to disconnect
  if (room.questionCount < GAME_CONFIG.QUESTIONS_PER_MATCH) {
    endMatch(nsp, roomId, "player_disconnect");
  }
}

function cleanupRoom(roomId, reason) {
  console.log(`Cleaning up room ${roomId} due to: ${reason}`);

  // Clear timeout
  if (roomTimeouts[roomId]) {
    clearTimeout(roomTimeouts[roomId]);
    delete roomTimeouts[roomId];
  }

  // Remove room
  delete rooms[roomId];
}

// Utility function to get active rooms (for debugging)
exports.getActiveRooms = (req, res) => {
  const activeRooms = Object.keys(rooms).map((roomId) => ({
    roomId,
    players: rooms[roomId].playerNames,
    questionCount: rooms[roomId].questionCount,
    initialized: rooms[roomId].initialized,
  }));

  res.json({ activeRooms, count: activeRooms.length });
};

module.exports = {
  createChallenge: exports.createChallenge,
  getActiveRooms: exports.getActiveRooms,
  setupSocketForRoom,
};
