/*
src/controllers/matchController.js
Handles challenge via HTTP, immediate room creation, and dynamic Socket.io namespaces for multiplayer matches.
*/
const { v4: uuidv4 } = require("uuid");
const {
  loadQuestionsFromExcel,
  getLevelFromScore,
} = require("./questionController");
const Player = require("../models/Player");

// In-memory store of rooms
const rooms = {};

/**
 * POST /api/match/challenge
 * Initiates a challenge: creates a room immediately
 * Body: { fromPlayerId, toPlayerId }
 * Returns: { roomId }
 */
// exports.createChallenge = (req, res) => {
//   const { fromPlayerId, toPlayerId } = req.body;
//   if (!fromPlayerId || !toPlayerId) {
//     return res.status(400).json({ message: 'fromPlayerId and toPlayerId required' });
//   }

//   // Create room immediately
//   const roomId = uuidv4();
//   rooms[roomId] = {
//     players: [fromPlayerId, toPlayerId],
//     scores: {},
//     level: 1,
//     initialized: false,
//     responses: {}
//   };

//   return res.json({ roomId });
// };

exports.createChallenge = (req, res) => {
  const io = req.app.get("io"); // get the Socket.IO server
  const { fromPlayerId, toPlayerId } = req.body;
  if (!fromPlayerId || !toPlayerId) {
    return res
      .status(400)
      .json({ message: "fromPlayerId and toPlayerId required" });
  }

  // Create the room immediately
  const roomId = uuidv4();
  rooms[roomId] = {
    players: [fromPlayerId, toPlayerId],
    scores: {},
    level: 1,
    initialized: false,
    responses: {},
  };

  // **Wire up** the socket namespace for this room
  setupSocketForRoom(io, roomId);

  return res.json({ roomId });
};

/**
 * Function to setup socket namespace for a room
 */
exports.setupSocketForRoom = (io, roomId) => {
  const nsp = io.of(`/match/${roomId}`);
  nsp.on("connection", (socket) => {
    console.log(`Socket connected to /match/${roomId}:`, socket.id);
    socket.join(roomId);

    const room = rooms[roomId];
    // initialize match once both join namespace
    if (!room.initialized && Object.keys(nsp.sockets).length === 2) {
      // both players connected
      room.players.forEach((id) => (room.scores[id] = 0));
      room.level = 1;
      room.initialized = true;
      nsp.emit("matchStarted", { timer: 60, level: room.level });
      sendNextQuestion(nsp, roomId);
    }

    socket.on("submitAnswer", ({ playerId, answer }) => {
      // check answer correctness against stored room.currentQuestion.answer
      const correct =
        String(answer).trim() === String(room.currentQuestion.answer).trim();
      room.scores[playerId] = (room.scores[playerId] || 0) + (correct ? 1 : 0);
      room.responses[playerId] = true;

      // when both have responded
      if (Object.keys(room.responses).length === room.players.length) {
        checkAndAdvanceLevel(room);
        nsp.emit("roundResult", { scores: room.scores });
        room.responses = {};
        sendNextQuestion(nsp, roomId);
      }
    });

    socket.on("disconnect", () => {
      console.log(`Socket disconnected from /match/${roomId}:`, socket.id);
      // optional: cleanup room
    });
  });
};

async function endMatch(nsp, roomId) {
  const room = rooms[roomId];
  const [p1, p2] = room.players;
  const score1 = room.scores[p1];
  const score2 = room.scores[p2];
  // determine winner/loser or draw
  let winner = null,
    loser = null;
  if (score1 > score2) {
    winner = p1;
    loser = p2;
  } else if (score2 > score1) {
    winner = p2;
    loser = p1;
  }

  // fetch players
  const playerA = await Player.findById(p1);
  const playerB = await Player.findById(p2);
  // initialize PVP if missing
  playerA.pr = playerA.pr || { pvp: { easy: 1000, medium: 1000, hard: 1000 } };
  playerB.pr = playerB.pr || { pvp: { easy: 1000, medium: 1000, hard: 1000 } };

  // Determine difficulty of match
  const diff = room.currentQuestion.difficulty; // 'easy', 'medium', 'hard'

  // calculate rating deltas
  let deltaA = 0,
    deltaB = 0;
  // 1) Victory bonus
  if (winner) {
    if (winner === p1) {
      deltaA += 5;
      deltaB -= 5;
    } else {
      deltaB += 5;
      deltaA -= 5;
    }
  }
  // 2) Superiority: low rating player bonus on win/draw
  const low =
    playerA.pr.pvp[diff] <= playerB.pr.pvp[diff]
      ? { pl: playerA, id: p1 }
      : { pl: playerB, id: p2 };
  const high =
    low.id === p1 ? { pl: playerB, id: p2 } : { pl: playerA, id: p1 };
  if (!winner || winner === low.id) {
    deltaA += low.id === p1 ? +1 : -1;
    deltaB += low.id === p2 ? +1 : -1;
  }
  // 3) Point difference
  const diffPts = Math.min(4, Math.ceil(Math.abs(score1 - score2) / 4));
  if (winner) {
    if (winner === p1) {
      deltaA += diffPts;
      deltaB -= diffPts;
    } else {
      deltaB += diffPts;
      deltaA -= diffPts;
    }
  }

  // apply deltas to PVP ratings
  playerA.pr.pvp[diff] = Math.max(0, playerA.pr.pvp[diff] + deltaA);
  playerB.pr.pvp[diff] = Math.max(0, playerB.pr.pvp[diff] + deltaB);

  // persist
  await playerA.save();
  await playerB.save();

  nsp.emit("matchEnded", {
    scores: room.scores,
    ratingDeltas: { [p1]: deltaA, [p2]: deltaB },
    newRatings: { [p1]: playerA.pr.pvp[diff], [p2]: playerB.pr.pvp[diff] },
  });
  delete rooms[roomId];
}

function sendNextQuestion(nsp, roomId) {
  const room = rooms[roomId];
  // determine level by lowest score
  const minScore = Math.min(...Object.values(room.scores));
  room.level = getLevelFromScore(minScore);

  const allQs = loadQuestionsFromExcel();
  const pool = allQs.filter((q) => q.levelNumber === room.level);
  const question = pool[Math.floor(Math.random() * pool.length)];
  room.currentQuestion = question;

  nsp.emit("newQuestion", { question, level: room.level });
}

function checkAndAdvanceLevel(room) {
  const thresholds = {
    1: 0,
    2: 6,
    3: 10,
    4: 14,
    5: 18,
    6: 22,
    7: 26,
    8: 30,
    9: 34,
    10: 38,
  };
  const next = room.level + 1;
  const reqScore = thresholds[next] || Infinity;
  const scores = room.players.map((id) => room.scores[id]);
  if (scores.every((s) => s >= reqScore)) room.level = next;
}
