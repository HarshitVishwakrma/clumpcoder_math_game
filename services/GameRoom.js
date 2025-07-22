// const { v4 : uuidv4 } = require('uuid');

// class GameRoom {
//   constructor(players, questionService) {
//     this.id = uuidv4();
//     this.players = players;
//     this.questionService = questionService;
//     this.createdAt = Date.now();
//     this.gameState = 'waiting'; // waiting, active, completed
//     this.currentQuestionIndex = 0;
//     this.questions = []; // Shared questions for both players
//     this.playerAnswers = new Map(); // questionIndex -> Map(playerId -> answer data)
//     this.playerScores = new Map(); // playerId -> score data
//     this.gameTimer = null;
//     this.questionTimer = null;

//     // Question Meter System
//     this.questionMeter = 0; // Current QM value
//     this.questionMeterController = null; // Player ID who controls QM (first to answer)
//     this.difficulty = 'medium'; // Game difficulty
//     this.symbols = ['sum', 'difference', 'product', 'quotient']; // Math symbols for questions

//     this.gameSettings = {
//       questionsPerGame: 10,
//       timePerQuestion: 30000, // 30 seconds
//       totalGameTime: 600000 // 10 minutes max
//     };

//     // Initialize player scores
//     this.players.forEach(player => {
//       this.playerScores.set(player.id, {
//         score: 0,
//         correctAnswers: 0,
//         totalTime: 0,
//         streak: 0,
//         maxStreak: 0,
//         questionsAnswered: 0
//       });
//     });

//     // Set initial question meter based on lower player rating
//     this.questionMeter = this.questionService.getInitialQuestionMeter(
//       this.players[0].rating,
//       this.players[1].rating
//     );
//   }

//   startGame() {
//     this.gameState = 'active';

//     // Generate first question based on initial QM
//     this.generateNextQuestion();

//     this.startGameTimer();
//     this.startQuestionTimer();
//   }

//   generateNextQuestion() {
//     try {
//       // Use the lower player rating for question generation
//       const lowerRating = Math.min(this.players[0].rating, this.players[1].rating);

//       const question = this.questionService.generateQuestion(
//         this.difficulty,
//         this.symbols,
//         lowerRating,
//         this.questionMeter
//       );

//       this.questions.push(question);
//       console.log(`Generated question ${this.questions.length} with QM: ${this.questionMeter}, Level: ${question.finalLevel}`);
//     } catch (error) {
//       console.error("Error generating question:", error);
//       // Fallback to a basic question structure
//       this.questions.push({
//         question: "What is 2 + 2?",
//         input1: "2",
//         input2: "2",
//         answer: "4",
//         symbol: "+",
//         difficulty: this.difficulty,
//         finalLevel: 1,
//         qm: this.questionMeter
//       });
//     }
//   }

//   startGameTimer() {
//     this.gameTimer = setTimeout(() => {
//       this.endGame();
//     }, this.gameSettings.totalGameTime);
//   }

//   startQuestionTimer() {
//     this.questionTimer = setTimeout(() => {
//       this.completeQuestion();
//     }, this.gameSettings.timePerQuestion);
//   }

//   getCurrentQuestion() {
//     return this.questions[this.currentQuestionIndex];
//   }

//   submitAnswer(playerId, answer, timeSpent) {
//     if (this.gameState !== 'active') {
//       throw new Error('Game is not active');
//     }

//     const currentQuestion = this.getCurrentQuestion();
//     if (!currentQuestion) {
//       throw new Error('No current question');
//     }

//     // Initialize answers map for current question if not exists
//     if (!this.playerAnswers.has(this.currentQuestionIndex)) {
//       this.playerAnswers.set(this.currentQuestionIndex, new Map());
//     }

//     const questionAnswers = this.playerAnswers.get(this.currentQuestionIndex);

//     // Check if player already answered
//     if (questionAnswers.has(playerId)) {
//       throw new Error('Player already answered this question');
//     }

//     const isCorrect = this.questionService.checkAnswer(currentQuestion, answer);
//     const answerData = {
//       answer,
//       isCorrect,
//       timeSpent,
//       submittedAt: Date.now()
//     };

//     questionAnswers.set(playerId, answerData);

//     // Update player score and streak
//     this.updatePlayerScore(playerId, answerData, currentQuestion);

//     // Handle Question Meter control (first to answer controls QM)
//     const isFirstToAnswer = questionAnswers.size === 1;
//     if (isFirstToAnswer) {
//       this.questionMeterController = playerId;

//       // Update question meter based on this player's answer
//       const player = this.players.find(p => p.id === playerId);
//       const qmChange = this.questionService.calculateQMChange(
//         isCorrect,
//         player.rating,
//         currentQuestion.finalLevel
//       );

//       this.questionMeter = Math.max(0, this.questionMeter + qmChange);

//       console.log(`Player ${playerId} controls QM. Change: ${qmChange}, New QM: ${this.questionMeter}`);
//     }

//     return {
//       isCorrect,
//       timeSpent,
//       currentScore: this.playerScores.get(playerId),
//       isFirstToAnswer,
//       questionMeter: this.questionMeter,
//       questionMeterController: this.questionMeterController
//     };
//   }

//   updatePlayerScore(playerId, answerData, question) {
//     const playerScore = this.playerScores.get(playerId);

//     playerScore.questionsAnswered++;

//     if (answerData.isCorrect) {
//       playerScore.streak++;
//       playerScore.maxStreak = Math.max(playerScore.maxStreak, playerScore.streak);
//       playerScore.correctAnswers++;

//       // Calculate score using the question service method
//       playerScore.score = this.questionService.calculateScore(
//         playerScore.score,
//         true,
//         playerScore.streak
//       );
//     } else {
//       playerScore.streak = 0;
//     }

//     playerScore.totalTime += answerData.timeSpent;
//   }

//   isQuestionComplete() {
//     if (!this.playerAnswers.has(this.currentQuestionIndex)) {
//       return false;
//     }

//     const questionAnswers = this.playerAnswers.get(this.currentQuestionIndex);
//     return questionAnswers.size === this.players.length;
//   }

//   completeQuestion() {
//     if (this.questionTimer) {
//       clearTimeout(this.questionTimer);
//       this.questionTimer = null;
//     }

//     const currentQuestion = this.getCurrentQuestion();
//     const questionAnswers = this.playerAnswers.get(this.currentQuestionIndex) || new Map();

//     // Handle players who didn't answer (timeout)
//     this.players.forEach(player => {
//       if (!questionAnswers.has(player.id)) {
//         const timeoutAnswerData = {
//           answer: null,
//           isCorrect: false,
//           timeSpent: this.gameSettings.timePerQuestion,
//           submittedAt: Date.now()
//         };

//         questionAnswers.set(player.id, timeoutAnswerData);

//         // Update score for timeout (breaks streak)
//         const playerScore = this.playerScores.get(player.id);
//         playerScore.streak = 0;
//         playerScore.totalTime += this.gameSettings.timePerQuestion;
//         playerScore.questionsAnswered++;

//         // If this player was supposed to control QM but timed out
//         if (questionAnswers.size === 1) { // First player timed out
//           this.questionMeterController = player.id;
//           // Decrease QM for timeout
//           const qmChange = this.questionService.calculateQMChange(
//             false,
//             player.rating,
//             currentQuestion.finalLevel
//           );
//           this.questionMeter = Math.max(0, this.questionMeter + qmChange);
//         }
//       }
//     });

//     return {
//       questionIndex: this.currentQuestionIndex,
//       question: currentQuestion,
//       answers: Object.fromEntries(questionAnswers),
//       correctAnswer: currentQuestion.answer,
//       explanation: currentQuestion.explanation || `The correct answer is ${currentQuestion.answer}`,
//       playerScores: Object.fromEntries(this.playerScores),
//       questionMeter: this.questionMeter,
//       questionMeterController: this.questionMeterController
//     };
//   }

//   nextQuestion() {
//     this.currentQuestionIndex++;
//     if (this.hasMoreQuestions()) {
//       // Generate next question based on updated QM
//       this.generateNextQuestion();
//       this.startQuestionTimer();

//       // Reset QM controller for next question
//       this.questionMeterController = null;
//     }
//   }

//   hasMoreQuestions() {
//     return this.currentQuestionIndex < this.gameSettings.questionsPerGame - 1;
//   }

//   endGame() {
//     this.gameState = 'completed';

//     if (this.gameTimer) {
//       clearTimeout(this.gameTimer);
//       this.gameTimer = null;
//     }

//     if (this.questionTimer) {
//       clearTimeout(this.questionTimer);
//       this.questionTimer = null;
//     }

//     // Calculate final results and rating changes
//     const results = this.calculateGameResults();

//     return {
//       gameId: this.id,
//       finalScores: Object.fromEntries(this.playerScores),
//       winner: results.winner,
//       ratingChanges: results.ratingChanges,
//       gameStats: results.gameStats,
//       players: results.players,
//       finalQuestionMeter: this.questionMeter
//     };
//   }

//   calculateGameResults() {
//     const playerResults = this.players.map(player => {
//       const score = this.playerScores.get(player.id);
//       return {
//         playerId: player.id,
//         username: player.username,
//         currentRating: player.rating,
//         finalScore: score.score,
//         correctAnswers: score.correctAnswers,
//         totalTime: score.totalTime,
//         maxStreak: score.maxStreak,
//         questionsAnswered: score.questionsAnswered
//       };
//     });

//     // Determine winner (highest score, then least time if tied)
//     const winner = playerResults.reduce((best, current) => {
//       if (current.finalScore > best.finalScore) return current;
//       if (current.finalScore === best.finalScore && current.totalTime < best.totalTime) return current;
//       return best;
//     });

//     // Calculate rating changes using ELO-like system
//     const ratingChanges = this.calculateRatingChanges(playerResults, winner);

//     return {
//       winner,
//       ratingChanges,
//       gameStats: {
//         duration: Date.now() - this.createdAt,
//         totalQuestions: this.gameSettings.questionsPerGame,
//         questionsAnswered: this.currentQuestionIndex + 1,
//         finalQuestionMeter: this.questionMeter
//       },
//       players: playerResults.map((result, index) => ({
//         ...result,
//         won: result.playerId === winner.playerId,
//         newRating: result.currentRating + ratingChanges[index]
//       }))
//     };
//   }

//   calculateRatingChanges(playerResults, winner) {
//     const K = 32; // ELO K-factor
//     const changes = [];

//     for (let i = 0; i < playerResults.length; i++) {
//       const player = playerResults[i];
//       const opponent = playerResults[1 - i]; // Assumes 2 players

//       const expectedScore = 1 / (1 + Math.pow(10, (opponent.currentRating - player.currentRating) / 400));
//       const actualScore = player.playerId === winner.playerId ? 1 : 0;

//       const ratingChange = Math.round(K * (actualScore - expectedScore));
//       changes.push(ratingChange);
//     }

//     return changes;
//   }

//   handlePlayerDisconnect(playerId) {
//     // Mark game as completed due to disconnect
//     this.gameState = 'completed';

//     if (this.gameTimer) {
//       clearTimeout(this.gameTimer);
//     }
//     if (this.questionTimer) {
//       clearTimeout(this.questionTimer);
//     }
//   }

//   getPlayers() {
//     return this.players;
//   }

//   getGameState() {
//     return {
//       gameId: this.id,
//       state: this.gameState,
//       currentQuestionIndex: this.currentQuestionIndex,
//       totalQuestions: this.gameSettings.questionsPerGame,
//       playerScores: Object.fromEntries(this.playerScores),
//       timeRemaining: this.getTimeRemaining(),
//       questionMeter: this.questionMeter,
//       questionMeterController: this.questionMeterController,
//       difficulty: this.difficulty
//     };
//   }

//   getTimeRemaining() {
//     if (this.gameState !== 'active') return 0;

//     const elapsed = Date.now() - this.createdAt;
//     return Math.max(0, this.gameSettings.totalGameTime - elapsed);
//   }

//   getPublicData() {
//     return {
//       id: this.id,
//       players: this.players.map(p => ({
//         id: p.id,
//         username: p.username,
//         rating: p.rating
//       })),
//       createdAt: this.createdAt,
//       gameState: this.gameState,
//       questionMeter: this.questionMeter,
//       difficulty: this.difficulty
//     };
//   }
// }

// module.exports = {GameRoom}

// services/GameRoom.js
const { v4: uuidv4 } = require("uuid");
const Player = require("../models/Player");

async function updatePlayerRatingInDatabase(player_username, ratings, diff) {
  try {
    const player = await Player.findOne({ username: player_username });
    if (!player) {
      throw new Error(`Player not found: ${player_username}`);
    }
    const current = player.pr.pvp[diff];

    // 7) Apply and save
    player.pr.pvp[diff] = current + ratings;
    await player.save();

    return { player };
  } catch (err) {
    console.error("Error updating PvP rating:", err);
    throw err;
  }
}

async function savePVPGameToDatabase(gameData) {
  try {
    // Find player ObjectIds by username
    const player1 = await Player.findOne({
      username: gameData.player1Username,
    });
    const player2 = await Player.findOne({
      username: gameData.player2Username,
    });

    if (!player1 || !player2) {
      throw new Error("One or both players not found in database");
    }

    // Determine result
    let result;
    let winner = null;

    if (gameData.player1Score > gameData.player2Score) {
      result = "Player1Won";
      winner = player1._id;
    } else if (gameData.player2Score > gameData.player1Score) {
      result = "Player2Won";
      winner = player2._id;
    } else {
      result = "Draw";
      // winner remains null for draw
    }

    // Create new PVP game record
    const pvpGame = new PVPGame({
      player1: player1._id,
      player2: player2._id,
      scorePlayer1: gameData.player1Score,
      scorePlayer2: gameData.player2Score,
      winner: winner,
      result: result,
      gameDuration: Math.floor(gameData.gameDuration / 1000), // Convert ms to seconds
      playedAt: new Date(),
    });

    await pvpGame.save();
    console.log("PVP Game saved successfully:", pvpGame._id);
    return pvpGame;
  } catch (err) {
    console.error("Error saving PVP game:", err);
    throw err;
  }
}

class GameRoom {
  constructor(players, questionService) {
    this.id = uuidv4();
    this.players = players;
    this.currentQuestionIndex = 0;
    this.questionService = questionService;
    this.createdAt = Date.now();
    this.gameState = "waiting"; // waiting, active, completed

    // Track each player's progress index
    this.playerProgress = new Map(players.map((p) => [p.id, 0]));

    // Shared questions array generated on demand
    this.questions = [];
    this.playerAnswers = new Map(); // questionIndex -> Map(playerId -> answer data)
    this.playerScores = new Map(); // playerId -> score data

    this.gameTimer = null;
    this.questionTimer = null;

    // Question Meter System
    this.questionMeter = questionService.getInitialQuestionMeter(
      players[0].rating,
      players[1].rating
    );
    this.questionMeterController = null;

    this.difficulty =
      players[0].rating > players[1].rating ? players[1].diff : players[0].diff;
    this.symbols = ["sum", "difference", "product", "quotient"];

    this.gameSettings = {
      questionsPerGame: 10,
      timePerQuestion: 30000, // 30 seconds
      totalGameTime: this.players[0].timer, // 1 minutes
    };

    // Initialize per-player score data
    players.forEach((player) => {
      this.playerScores.set(player.id, {
        score: 0,
        correctAnswers: 0,
        totalTime: 0,
        streak: 0,
        maxStreak: 0,
        questionsAnswered: 0,
      });
    });
  }

  getOpposingPlayer(playerId) {
    return this.players.find((p) => p.id !== playerId);
  }

  getCurrentQuestion() {
    console.log(
      "current question : ",
      this.questions[this.currentQuestionIndex]
    );
    return this.questions[this.currentQuestionIndex];
  }

  getPublicData() {
    return {
      id: this.id,
      players: this.players.map((p) => ({
        id: p.id,
        username: p.username,
        rating: p.rating,
      })),
      createdAt: this.createdAt,
      gameState: this.gameState,
      questionMeter: this.questionMeter,
      difficulty: this.difficulty,
    };
  }

  startGame() {
    this.gameState = "active";
    // Start global game timer
    this.gameTimer = setTimeout(
      () => this.endGame(),
      this.gameSettings.totalGameTime
    );
    // Kick off each player's first question
    this.players.forEach((p) => this.emitNextQuestion(p.id));
  }

  // Generates or retrieves the next question for a given player
  emitNextQuestion(playerId) {
    console.log("line no523 Game room " + playerId);
    const idx = this.playerProgress.get(playerId);

    // Generate new question if needed
    if (this.questions.length <= idx) {
      this.questionMeterController = null;
      const lowerRating = Math.min(...this.players.map((p) => p.rating));
      let q;
      try {
        q = this.questionService.generateQuestion(
          this.difficulty,
          this.symbols,
          lowerRating,
          this.questionMeter
        );
      } catch {
        // fallback
        q = {
          question: "What is 2 + 2?",
          input1: "2",
          input2: "2",
          answer: "4",
          symbol: "sum",
          difficulty: this.difficulty,
          finalLevel: 1,
          qm: this.questionMeter,
        };
      }
      this.questions.push(q);
      // reset hasAnswered flag
      this.players.forEach((p) => {
        const progressIdx = this.playerProgress.get(p.id);
        const key = `${progressIdx}`;
        this.playerAnswers.set(key, new Map());
      });
    }

    // Send to the specific player
    const socketId = this.players.find((p) => p.id === playerId).socketId;
    console.log("line no.561" + socketId);
    console.log("newQuestion" + this.questions[idx]);
    console.log(this.io);
    // this.startQuestionTimer();
    this.io &&
      this.io.to(socketId).emit("next-question", {
        // data : "dataaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        question: this.questions[idx],
        gameState: this.getGameState(),
        questionMeter: this.questionMeter,
      });

    // Advance their index
    this.playerProgress.set(playerId, idx + 1);
  }

  startQuestionTimer() {
    if (this.questionTimer) clearTimeout(this.questionTimer);
    this.questionTimer = setTimeout(
      () => this.handleQuestionTimeout(),
      this.gameSettings.timePerQuestion
    );
  }

  handleQuestionTimeout() {
    // Auto-submit incorrect for those who haven't answered
    this.players.forEach((player) => {
      const idx = this.playerProgress.get(player.id) - 1;
      const answersMap = this.playerAnswers.get(`${idx}`) || new Map();
      if (!answersMap.has(player.id)) {
        this.submitAnswer(player.id, null, this.gameSettings.timePerQuestion);
      }
    });
    // Optionally emit a summary
    const summary = this.completeQuestion();
    this.players.forEach((p) =>
      this.io.to(p.socketId).emit("question-completed", summary)
    );

    // Continue each player to next question
    this.players.forEach((p) => this.emitNextQuestion(p.id));
  }

  submitAnswer(playerId, answer, timeSpent) {
    console.log("at line no. 601, inside submit answer");
    if (this.gameState !== "active") throw new Error("Game not active");
    const idx = this.playerProgress.get(playerId) - 1;
    const q = this.questions[idx];
    console.log("question after submitting the answer : ", q);
    if (!q) throw new Error("No question found");

    const key = `${idx}`;
    const map = this.playerAnswers.get(key);
    if (map.has(playerId)) throw new Error("Already answered");

    const isCorrect = this.questionService.checkAnswer(q, answer);
    map.set(playerId, { answer, isCorrect, timeSpent, timestamp: Date.now() });

    // Update score & stats
    const ps = this.playerScores.get(playerId);
    ps.questionsAnswered++;
    ps.totalTime += timeSpent;
    if (isCorrect) {
      ps.streak++;
      ps.maxStreak = Math.max(ps.maxStreak, ps.streak);
      ps.correctAnswers++;
      ps.score = this.questionService.calculateScore(ps.score, true, ps.streak);
    } else {
      ps.streak = 0;
    }
    // averageResponseTime if needed

    // QM control by first answer
    if (map.size === 1) {
      this.questionMeterController = playerId;
      const change = this.questionService.calculateQMChange(
        isCorrect,
        this.players.find((p) => p.id === playerId).rating,
        q.finalLevel
      );
      this.questionMeter = Math.max(0, this.questionMeter + change);
    }

    console.log("at line 640, at the end of submit answer");

    return {
      isCorrect,
      isFirstToAnswer: map.size === 1,
      questionMeter: this.questionMeter,
      questionMeterController: this.questionMeterController,
    };
  }

  getPlayers() {
    console.log("in the get player function ");
    return this.players;
  }
  completeQuestion() {
    if (this.questionTimer) clearTimeout(this.questionTimer);
    const idx = this.playerProgress.get(this.players[0].id) - 1;
    const q = this.questions[idx];
    const answers = Object.fromEntries(this.playerAnswers.get(`${idx}`));
    return {
      questionIndex: idx,
      question: q,
      answers,
      questionMeter: this.questionMeter,
      questionMeterController: this.questionMeterController,
    };
  }

  async endGame() {
    this.gameState = "completed";
    clearTimeout(this.gameTimer);
    clearTimeout(this.questionTimer);
    // compute final results, ratings, etc.
    const gameResults = await this.calculateGameResults();

    // Save game data to database
    try {
      await this.saveGameToDatabase(gameResults);
    } catch (error) {
      console.error("Failed to save game to database:", error);
      // You might want to emit an error event to clients here
    }

    return gameResults;
  }

  async calculateGameResults() {
    const playerResults = this.players.map((player) => {
      const score = this.playerScores.get(player.id);
      return {
        playerId: player.id,
        username: player.username,
        currentRating: player.rating,
        finalScore: score.score,
        correctAnswers: score.correctAnswers,
        totalTime: score.totalTime,
        maxStreak: score.maxStreak,
        questionsAnswered: score.questionsAnswered,
      };
    });

    const winner = playerResults.reduce((best, current) => {
      if (current.finalScore > best.finalScore) return current;
      if (
        current.finalScore === best.finalScore &&
        current.totalTime < best.totalTime
      )
        return current;
      return best;
    });

    // Calculate rating changes using ELO-like system
    const ratingChanges = await this.calculateRatingChanges(
      playerResults,
      winner
    );
    return {
      winner,
      ratingChanges,
      gameStats: {
        duration: Date.now() - this.createdAt,
        totalQuestions: this.gameSettings.questionsPerGame,
        questionsAnswered: this.currentQuestionIndex + 1,
        finalQuestionMeter: this.questionMeter,
      },
      players: playerResults.map((result, index) => ({
        ...result,
        won: result.playerId === winner.playerId,
        newRating: result.currentRating + ratingChanges[index],
      })),
    };
  }

  async saveGameToDatabase(gameResults) {
    try {
      const [player1, player2] = gameResults.players;

      const gameData = {
        player1Username: player1.username,
        player2Username: player2.username,
        player1Score: player1.finalScore,
        player2Score: player2.finalScore,
        gameDuration: gameResults.gameStats.duration,
      };

      await savePVPGameToDatabase(gameData);
      console.log("Game successfully saved to database");
    } catch (error) {
      console.error("Error saving game to database:", error);
      throw error;
    }
  }

  handlePlayerDisconnect(playerId) {
    // Mark game as completed due to disconnect
    this.gameState = "completed";

    if (this.gameTimer) {
      clearTimeout(this.gameTimer);
    }
    if (this.questionTimer) {
      clearTimeout(this.questionTimer);
    }
  }

  /**
   * Apply:
   * 1. Victory: +5 to winner, -5 to loser
   * 2. Superiority: +1 if the lower-rated player wins or draws, –1 to the opponent
   * 3. Point-Difference: |scoreA–scoreB|/4 rounded up (max 4): + for winner, – for loser
   */
  async calculateRatingChanges(playerResults, winner) {
    const changes = [];

    // Identify lower- and higher-rated players
    const [p1, p2] = playerResults;
    const lowPlayer = p1.currentRating <= p2.currentRating ? p1 : p2;
    const highPlayer = p1.currentRating > p2.currentRating ? p1 : p2;

    playerResults.forEach(async (p) => {
      // 1) Victory bonus
      let delta = p.playerId === winner.playerId ? +5 : -5;

      // 2) Superiority bonus
      const opp = playerResults.find((o) => o.playerId !== p.playerId);
      if (p.playerId === lowPlayer.playerId && p.finalScore >= opp.finalScore) {
        delta += 1;
        // Penalize opponent for superiority
        if (opp.playerId === highPlayer.playerId) {
          // we’ll subtract 1 from the opponent below when we handle them
        }
      } else if (
        p.playerId === highPlayer.playerId &&
        lowPlayer.finalScore >= highPlayer.finalScore
      ) {
        // high-rated player loses superiority
        delta -= 1;
      }

      // 3) Point-difference bonus (diff/4 rounded up, capped to 4)
      const diff = Math.abs(p.finalScore - opp.finalScore);
      const pd = Math.min(4, Math.ceil(diff / 4));
      delta += p.playerId === winner.playerId ? +pd : -pd;

      // await updatePlayerRatingInDatabase(p, delta, p.diff);
      try {
        // Update player rating in database
        await updatePlayerRatingInDatabase(p.username, delta, this.difficulty);
        console.log(`Updated rating for ${p.username}: ${delta}`);
      } catch (error) {
        console.error(`Failed to update rating for ${p.username}:`, error);
      }

      changes.push(delta);
    });

    return changes;
  }

  getGameState() {
    return {
      gameId: this.id,
      state: this.gameState,
      totalQuestions: this.gameSettings.questionsPerGame,
      playerProgress: Object.fromEntries(this.playerProgress),
      playerScores: Object.fromEntries(this.playerScores),
      questionMeter: this.questionMeter,
      questionMeterController: this.questionMeterController,
      timeRemaining: Math.max(
        0,
        this.gameSettings.totalGameTime - (Date.now() - this.createdAt)
      ),
    };
  }

  // Allow setting io instance for emissions
  bindIO(io) {
    this.io = io;
  }
}

module.exports = { GameRoom };
