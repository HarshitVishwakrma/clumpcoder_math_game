// /*
// src/controllers/matchController.js
// Improved version with better rating logic, validation, and cleanup
// */
// const { v4: uuidv4 } = require("uuid");
// const Player = require("../models/Player");
// const {
//   loadQuestionsFromExcel,
//   getLevelFromScore,
// } = require("./questionController");

// // In-memory store of rooms with cleanup tracking
// const rooms = {};
// const roomTimeouts = {};

// // Constants for game configuration
// const GAME_CONFIG = {
//   QUESTIONS_PER_MATCH: 10,
//   MATCH_TIMEOUT: 300000, // 5 minutes
//   ROUND_TIMEOUT: 60000, // 60 seconds per question
//   BASE_RATING: 1000,
//   MIN_RATING: 0,
//   MAX_RATING_CHANGE: 50,
// };

// // Level thresholds based on correct answers
// const LEVEL_THRESHOLDS = {
//   1: 0,
//   2: 2,
//   3: 4,
//   4: 6,
//   5: 8,
//   6: 10,
//   7: 12,
//   8: 14,
//   9: 16,
//   10: 18,
// };

// /**
//  * POST /api/match/challenge
//  * Initiates a challenge: validates players and creates a room
//  * Body: { fromPlayerId, toPlayerId, difficulty }
//  * Returns: { roomId, message }
//  */
// exports.createChallenge = async (req, res) => {
//   try {
//     const io = req.app.get("io");
//     const { fromPlayerId, toPlayerId, difficulty = "medium" } = req.body;

//     // Validation
//     if (!fromPlayerId || !toPlayerId) {
//       return res
//         .status(400)
//         .json({ message: "fromPlayerId and toPlayerId required" });
//     }

//     if (!["easy", "medium", "hard"].includes(difficulty)) {
//       return res.status(400).json({ message: "Invalid difficulty level" });
//     }

//     if (fromPlayerId === toPlayerId) {
//       return res.status(400).json({ message: "Cannot challenge yourself" });
//     }

//     // Verify both players exist
//     const [fromPlayer, toPlayer] = await Promise.all([
//       Player.findById(fromPlayerId),
//       Player.findById(toPlayerId),
//     ]);

//     if (!fromPlayer || !toPlayer) {
//       return res.status(404).json({ message: "One or both players not found" });
//     }

//     const roomId = uuidv4();
//     rooms[roomId] = {
//       players: [fromPlayerId, toPlayerId],
//       playerNames: {
//         [fromPlayerId]: fromPlayer.username,
//         [toPlayerId]: toPlayer.username,
//       },
//       scores: {},
//       difficulty,
//       level: 1,
//       initialized: false,
//       responses: {},
//       questionCount: 0,
//       questionsAsked: [],
//       startTime: null,
//       currentQuestion: null,
//     };

//     // Set up room timeout
//     roomTimeouts[roomId] = setTimeout(() => {
//       cleanupRoom(roomId, "timeout");
//     }, GAME_CONFIG.MATCH_TIMEOUT);

//     setupSocketForRoom(io, roomId);

//     return res.json({
//       roomId,
//       message: "Challenge created successfully",
//       difficulty,
//     });
//   } catch (error) {
//     console.error("Error creating challenge:", error);
//     return res.status(500).json({ message: "Server error" });
//   }
// };

// /**
//  * Setup socket namespace for a room with improved error handling
//  */
// function setupSocketForRoom(io, roomId) {
//   const nsp = io.of(`/match/${roomId}`);

//   nsp.on("connection", (socket) => {
//     console.log(`Socket connected to /match/${roomId}:`, socket.id);
//     socket.join(roomId);

//     const room = rooms[roomId];
//     if (!room) {
//       socket.emit("error", { message: "Room no longer exists" });
//       return;
//     }

//     // Initialize match when both players connect
//     const connectedCount = nsp.sockets.size; // Map#size
//     if (!room.initialized && connectedCount === room.players.length) {
//       console.log("Both players connected—initializing match");
//       initializeMatch(nsp, roomId);
//     }

//     socket.on("submitAnswer", ({ playerId, answer, timeLeft }) => {
//       handleAnswerSubmission(nsp, roomId, playerId, answer, timeLeft);
//     });

//     socket.on("disconnect", () => {
//       console.log(`Socket disconnected from /match/${roomId}:`, socket.id);
//       handlePlayerDisconnect(nsp, roomId, socket.id);
//     });

//     // socket.on('playerReady', ({ playerId }) => {
//     //   handlePlayerReady(nsp, roomId, playerId);
//     // });
//   });
// }

// function initializeMatch(nsp, roomId) {
//   const room = rooms[roomId];
//   if (!room) return;
//   console.log("match initialized");

//   // Initialize scores
//   room.players.forEach((id) => (room.scores[id] = 0));
//   room.initialized = true;
//   room.startTime = Date.now();

//   nsp.emit("matchStarted", {
//     timer: GAME_CONFIG.ROUND_TIMEOUT / 1000,
//     level: room.level,
//     difficulty: room.difficulty,
//     totalQuestions: GAME_CONFIG.QUESTIONS_PER_MATCH,
//     players: room.playerNames,
//   });

//   sendNextQuestion(nsp, roomId);
// }

// function sendNextQuestion(nsp, roomId) {
//   const room = rooms[roomId];
//   if (!room) return;

//   try {
//     // Determine level based on lowest score (keeps game balanced)
//     const minScore = Math.min(...Object.values(room.scores));
//     room.level = getLevelFromScore(minScore);

//     const allQuestions = loadQuestionsFromExcel();
//     const availableQuestions = allQuestions.filter(
//       (q) =>
//         q.levelNumber === room.level &&
//         q.difficulty === room.difficulty &&
//         !room.questionsAsked.includes(q.id)
//     );

//     if (availableQuestions.length === 0) {
//       // Fallback to any question of the right difficulty if no unused questions
//       const fallbackQuestions = allQuestions.filter(
//         (q) => q.difficulty === room.difficulty
//       );
//       if (fallbackQuestions.length === 0) {
//         endMatch(nsp, roomId, "no_questions");
//         return;
//       }
//       room.currentQuestion =
//         fallbackQuestions[Math.floor(Math.random() * fallbackQuestions.length)];
//     } else {
//       room.currentQuestion =
//         availableQuestions[
//           Math.floor(Math.random() * availableQuestions.length)
//         ];
//     }

//     room.questionsAsked.push(room.currentQuestion.id);
//     room.responses = {};

//     nsp.emit("newQuestion", {
//       question: {
//         ...room.currentQuestion,
//         answer: undefined, // Don't send answer to client
//       },
//       level: room.level,
//       questionNumber: room.questionCount + 1,
//       totalQuestions: GAME_CONFIG.QUESTIONS_PER_MATCH,
//     });
//   } catch (error) {
//     console.error("Error sending question:", error);
//     endMatch(nsp, roomId, "error");
//   }
// }

// function handleAnswerSubmission(nsp, roomId, playerId, answer, timeLeft = 0) {
//   const room = rooms[roomId];
//   if (!room || !room.currentQuestion) return;

//   // Prevent duplicate submissions
//   if (room.responses[playerId]) return;

//   const correct =
//     String(answer).trim().toLowerCase() ===
//     String(room.currentQuestion.answer).trim().toLowerCase();

//   // Award points with time bonus
//   let points = 0;
//   if (correct) {
//     points = 1;
//     // Time bonus: up to 0.5 additional points based on speed
//     const timeBonus = Math.min(
//       0.5,
//       (timeLeft / (GAME_CONFIG.ROUND_TIMEOUT / 1000)) * 0.5
//     );
//     points += timeBonus;
//   }

//   room.scores[playerId] = (room.scores[playerId] || 0) + points;
//   room.responses[playerId] = { answer, correct, points };

//   // Check if all players have responded
//   if (Object.keys(room.responses).length === room.players.length) {
//     processRoundResults(nsp, roomId);
//   }
// }

// function processRoundResults(nsp, roomId) {
//   const room = rooms[roomId];
//   if (!room) return;

//   room.questionCount++;

//   // Emit round results
//   nsp.emit("roundResult", {
//     scores: room.scores,
//     responses: room.responses,
//     correctAnswer: room.currentQuestion.answer,
//     questionNumber: room.questionCount,
//   });

//   // Check if match is complete
//   if (room.questionCount >= GAME_CONFIG.QUESTIONS_PER_MATCH) {
//     setTimeout(() => endMatch(nsp, roomId, "completed"), 3000); // 3 second delay to show results
//   } else {
//     setTimeout(() => sendNextQuestion(nsp, roomId), 3000); // 3 second delay between questions
//   }
// }

// /**
//  * Enhanced rating calculation with clearer logic
//  */
// function calculateRatingChanges(playerA, playerB, scoreA, scoreB, difficulty) {
//   const ratingA = playerA.pr?.pvp?.[difficulty] || GAME_CONFIG.BASE_RATING;
//   const ratingB = playerB.pr?.pvp?.[difficulty] || GAME_CONFIG.BASE_RATING;

//   // Basic ELO calculation
//   const K = 32; // K-factor
//   const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
//   const expectedB = 1 - expectedA;

//   let actualA, actualB;
//   if (scoreA > scoreB) {
//     actualA = 1;
//     actualB = 0; // A wins
//   } else if (scoreB > scoreA) {
//     actualA = 0;
//     actualB = 1; // B wins
//   } else {
//     actualA = 0.5;
//     actualB = 0.5; // Draw
//   }

//   // Calculate base rating changes
//   let deltaA = Math.round(K * (actualA - expectedA));
//   let deltaB = Math.round(K * (actualB - expectedB));

//   // Performance bonus based on score difference
//   const scoreDiff = Math.abs(scoreA - scoreB);
//   const performanceBonus = Math.min(10, Math.floor(scoreDiff * 2));

//   if (scoreA > scoreB) {
//     deltaA += performanceBonus;
//     deltaB -= performanceBonus;
//   } else if (scoreB > scoreA) {
//     deltaB += performanceBonus;
//     deltaA -= performanceBonus;
//   }

//   // Limit maximum rating change
//   deltaA = Math.max(
//     -GAME_CONFIG.MAX_RATING_CHANGE,
//     Math.min(GAME_CONFIG.MAX_RATING_CHANGE, deltaA)
//   );
//   deltaB = Math.max(
//     -GAME_CONFIG.MAX_RATING_CHANGE,
//     Math.min(GAME_CONFIG.MAX_RATING_CHANGE, deltaB)
//   );

//   return { deltaA, deltaB };
// }

// /**
//  * Ends the match with improved rating calculation and cleanup
//  */
// async function endMatch(nsp, roomId, reason = "completed") {
//   const room = rooms[roomId];
//   if (!room) return;

//   try {
//     const [p1, p2] = room.players;
//     const score1 = room.scores[p1] || 0;
//     const score2 = room.scores[p2] || 0;

//     // Determine winner
//     let winner = null;
//     if (score1 > score2) winner = p1;
//     else if (score2 > score1) winner = p2;
//     // else it's a draw

//     // Get player data
//     const [playerA, playerB] = await Promise.all([
//       Player.findById(p1),
//       Player.findById(p2),
//     ]);

//     if (!playerA || !playerB) {
//       console.error("Players not found during match end");
//       cleanupRoom(roomId, "player_not_found");
//       return;
//     }

//     // Initialize PR if not exists
//     if (!playerA.pr) playerA.pr = { practice: {}, pvp: {} };
//     if (!playerB.pr) playerB.pr = { practice: {}, pvp: {} };
//     if (!playerA.pr.pvp) playerA.pr.pvp = {};
//     if (!playerB.pr.pvp) playerB.pr.pvp = {};

//     const difficulty = room.difficulty;
//     playerA.pr.pvp[difficulty] =
//       playerA.pr.pvp[difficulty] || GAME_CONFIG.BASE_RATING;
//     playerB.pr.pvp[difficulty] =
//       playerB.pr.pvp[difficulty] || GAME_CONFIG.BASE_RATING;

//     // Calculate rating changes
//     const { deltaA, deltaB } = calculateRatingChanges(
//       playerA,
//       playerB,
//       score1,
//       score2,
//       difficulty
//     );

//     // Apply rating changes
//     const newRatingA = Math.max(
//       GAME_CONFIG.MIN_RATING,
//       playerA.pr.pvp[difficulty] + deltaA
//     );
//     const newRatingB = Math.max(
//       GAME_CONFIG.MIN_RATING,
//       playerB.pr.pvp[difficulty] + deltaB
//     );

//     playerA.pr.pvp[difficulty] = newRatingA;
//     playerB.pr.pvp[difficulty] = newRatingB;

//     // Save to database
//     await Promise.all([playerA.save(), playerB.save()]);

//     // Emit match results
//     nsp.emit("matchEnded", {
//       reason,
//       scores: room.scores,
//       winner,
//       ratingDeltas: { [p1]: deltaA, [p2]: deltaB },
//       newRatings: { [p1]: newRatingA, [p2]: newRatingB },
//       matchDuration: room.startTime ? Date.now() - room.startTime : 0,
//     });

//     // Cleanup
//     cleanupRoom(roomId, reason);
//   } catch (error) {
//     console.error("Error ending match:", error);
//     cleanupRoom(roomId, "error");
//   }
// }

// function handlePlayerDisconnect(nsp, roomId, socketId) {
//   const room = rooms[roomId];
//   if (!room) return;

//   // If match hasn't started yet or is in progress, end it due to disconnect
//   if (room.questionCount < GAME_CONFIG.QUESTIONS_PER_MATCH) {
//     endMatch(nsp, roomId, "player_disconnect");
//   }
// }

// function cleanupRoom(roomId, reason) {
//   console.log(`Cleaning up room ${roomId} due to: ${reason}`);

//   // Clear timeout
//   if (roomTimeouts[roomId]) {
//     clearTimeout(roomTimeouts[roomId]);
//     delete roomTimeouts[roomId];
//   }

//   // Remove room
//   delete rooms[roomId];
// }

// // Utility function to get active rooms (for debugging)
// exports.getActiveRooms = (req, res) => {
//   const activeRooms = Object.keys(rooms).map((roomId) => ({
//     roomId,
//     players: rooms[roomId].playerNames,
//     questionCount: rooms[roomId].questionCount,
//     initialized: rooms[roomId].initialized,
//   }));

//   res.json({ activeRooms, count: activeRooms.length });
// };

// module.exports = {
//   createChallenge: exports.createChallenge,
//   getActiveRooms: exports.getActiveRooms,
//   setupSocketForRoom,
// };



io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Player joins the lobby
  socket.on('join-lobby', (playerData) => {
    try {
      const player = addPlayer(socket.id, playerData);
      socket.emit('lobby-joined', { success: true, player });
      
      // Start matchmaking
      findMatch(player, (gameRoom) => {
        // Notify both players about the match
        const players = gameRoom.players;
        players.forEach(p => {
          io.to(p.socketId).emit('match-found', {
            gameRoom: {
              id: gameRoom.id,
              players: gameRoom.players.map(player => ({
                id: player.id,
                username: player.username,
                rating: player.rating
              })),
              createdAt: gameRoom.createdAt,
              gameState: gameRoom.gameState,
              questionMeter: gameRoom.questionMeter,
              difficulty: gameRoom.difficulty
            },
            opponent: players.find(player => player.id !== p.id),
            initialQuestionMeter: gameRoom.questionMeter
          });
        });
        
        // Start the game after a brief delay
        setTimeout(() => {
          gameRoom.gameState = 'active';
          players.forEach(p => {
            io.to(p.socketId).emit('game-started', {
              gameState: {
                gameId: gameRoom.id,
                state: gameRoom.gameState,
                currentQuestionIndex: gameRoom.currentQuestionIndex,
                totalQuestions: gameRoom.gameSettings.questionsPerGame,
                playerScores: gameRoom.playerScores,
                timeRemaining: gameRoom.gameSettings.totalGameTime,
                questionMeter: gameRoom.questionMeter,
                questionMeterController: gameRoom.questionMeterController,
                difficulty: gameRoom.difficulty
              },
              currentQuestion: gameRoom.questions[gameRoom.currentQuestionIndex]
            });
          });
        }, 3000);
      });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Player submits an answer
  socket.on('submit-answer', (data) => {
    try {
      const player = getPlayer(socket.id);
      if (!player) throw new Error('Player not found');

      const gameRoom = getPlayerGameRoom(player.id);
      if (!gameRoom) throw new Error('Game room not found');

      if (gameRoom.gameState !== 'active') {
        throw new Error('Game is not active');
      }

      const currentQuestion = gameRoom.questions[gameRoom.currentQuestionIndex];
      if (!currentQuestion) {
        throw new Error('No current question');
      }

      // Initialize answers map for current question if not exists
      if (!gameRoom.playerAnswers.has(gameRoom.currentQuestionIndex)) {
        gameRoom.playerAnswers.set(gameRoom.currentQuestionIndex, new Map());
      }

      const questionAnswers = gameRoom.playerAnswers.get(gameRoom.currentQuestionIndex);
      
      // Check if player already answered
      if (questionAnswers.has(player.id)) {
        throw new Error('Player already answered this question');
      }

      const isCorrect = String(data.answer).trim() === String(currentQuestion.answer).trim();
      const answerData = {
        answer: data.answer,
        isCorrect,
        timeSpent: data.timeSpent,
        submittedAt: Date.now()
      };

      questionAnswers.set(player.id, answerData);

      // Update player score and streak
      const playerScore = gameRoom.playerScores.get(player.id);
      playerScore.questionsAnswered++;
      
      if (answerData.isCorrect) {
        playerScore.streak++;
        playerScore.maxStreak = Math.max(playerScore.maxStreak, playerScore.streak);
        playerScore.correctAnswers++;
        
        // Calculate score
        if (playerScore.streak <= 2) {
          playerScore.score += 1;
        } else if (playerScore.streak === 3) {
          playerScore.score += 3;
        } else if (playerScore.streak === 5) {
          playerScore.score += 5;
        } else if (playerScore.streak === 10) {
          playerScore.score += 10;
        } else if (playerScore.streak % 10 === 0) {
          playerScore.score += 10;
        } else {
          playerScore.score += 1;
        }
      } else {
        playerScore.streak = 0;
      }
      
      playerScore.totalTime += answerData.timeSpent;

      // Handle Question Meter control (first to answer controls QM)
      const isFirstToAnswer = questionAnswers.size === 1;
      if (isFirstToAnswer) {
        gameRoom.questionMeterController = player.id;
        
        // Update question meter based on this player's answer
        const tiers = [
          { max: 400, thresh: 1 },
          { max: 800, thresh: 2 },
          { max: 1200, thresh: 2 },
          { max: 1600, thresh: 3 },
          { max: 2000, thresh: 4 },
          { max: Infinity, thresh: 5 },
        ];

        let qmChange = 0;
        for (const tier of tiers) {
          if (player.rating <= tier.max) {
            qmChange = currentQuestion.finalLevel <= tier.thresh 
              ? (isCorrect ? 2 : -1) 
              : (isCorrect ? 1 : -1);
            break;
          }
        }
        
        gameRoom.questionMeter = Math.max(0, gameRoom.questionMeter + qmChange);
        
        console.log(`Player ${player.id} controls QM. Change: ${qmChange}, New QM: ${gameRoom.questionMeter}`);
      }

      const result = {
        isCorrect,
        timeSpent: data.timeSpent,
        currentScore: gameRoom.playerScores.get(player.id),
        isFirstToAnswer,
        questionMeter: gameRoom.questionMeter,
        questionMeterController: gameRoom.questionMeterController
      };
      
      // Notify both players about the answer submission
      const players = gameRoom.players;
      players.forEach(p => {
        io.to(p.socketId).emit('answer-submitted', {
          playerId: player.id,
          result: result,
          gameState: {
            gameId: gameRoom.id,
            state: gameRoom.gameState,
            currentQuestionIndex: gameRoom.currentQuestionIndex,
            totalQuestions: gameRoom.gameSettings.questionsPerGame,
            playerScores: Object.fromEntries(gameRoom.playerScores),
            timeRemaining: Math.max(0, gameRoom.gameSettings.totalGameTime - (Date.now() - gameRoom.createdAt)),
            questionMeter: gameRoom.questionMeter,
            questionMeterController: gameRoom.questionMeterController,
            difficulty: gameRoom.difficulty
          },
          questionMeterUpdate: {
            newQM: result.questionMeter,
            controller: result.questionMeterController,
            isFirstToAnswer: result.isFirstToAnswer
          }
        });
      });

      // Check if question is complete (both players answered or time up)
      const isQuestionComplete = questionAnswers.size === players.length;
      
      if (isQuestionComplete) {
        // Complete question
        if (gameRoom.questionTimer) {
          clearTimeout(gameRoom.questionTimer);
          gameRoom.questionTimer = null;
        }

        const questionResult = {
          questionIndex: gameRoom.currentQuestionIndex,
          question: currentQuestion,
          answers: Object.fromEntries(questionAnswers),
          correctAnswer: currentQuestion.answer,
          explanation: currentQuestion.explanation || `The correct answer is ${currentQuestion.answer}`,
          playerScores: Object.fromEntries(gameRoom.playerScores),
          questionMeter: gameRoom.questionMeter,
          questionMeterController: gameRoom.questionMeterController
        };

        players.forEach(p => {
          io.to(p.socketId).emit('question-completed', {
            ...questionResult,
            questionMeterInfo: {
              currentQM: gameRoom.questionMeter,
              controller: gameRoom.questionMeterController
            }
          });
        });

        // Move to next question or end game
        setTimeout(() => {
          gameRoom.currentQuestionIndex++;
          const hasMoreQuestions = gameRoom.currentQuestionIndex < gameRoom.gameSettings.questionsPerGame;
          
          if (hasMoreQuestions) {
            // Generate next question based on updated QM
            import('./services/questionService.js').then(({ generateQuestion }) => {
              try {
                const lowerRating = Math.min(gameRoom.players[0].rating, gameRoom.players[1].rating);
                const nextQuestion = generateQuestion(
                  gameRoom.difficulty,
                  gameRoom.symbols,
                  lowerRating,
                  gameRoom.questionMeter
                );
                
                gameRoom.questions.push(nextQuestion);
                console.log(`Generated question ${gameRoom.questions.length} with QM: ${gameRoom.questionMeter}, Level: ${nextQuestion.finalLevel}`);
                
                // Reset QM controller for next question
                gameRoom.questionMeterController = null;
                
                // Start question timer
                gameRoom.questionTimer = setTimeout(() => {
                  // Handle timeout logic here if needed
                }, gameRoom.gameSettings.timePerQuestion);
                
                players.forEach(p => {
                  io.to(p.socketId).emit('next-question', {
                    question: nextQuestion,
                    gameState: {
                      gameId: gameRoom.id,
                      state: gameRoom.gameState,
                      currentQuestionIndex: gameRoom.currentQuestionIndex,
                      totalQuestions: gameRoom.gameSettings.questionsPerGame,
                      playerScores: Object.fromEntries(gameRoom.playerScores),
                      timeRemaining: Math.max(0, gameRoom.gameSettings.totalGameTime - (Date.now() - gameRoom.createdAt)),
                      questionMeter: gameRoom.questionMeter,
                      questionMeterController: gameRoom.questionMeterController,
                      difficulty: gameRoom.difficulty
                    },
                    questionMeter: gameRoom.questionMeter
                  });
                });
              } catch (error) {
                console.error("Error generating next question:", error);
              }
            });
          } else {
            // End game
            gameRoom.gameState = 'completed';
            
            if (gameRoom.gameTimer) {
              clearTimeout(gameRoom.gameTimer);
              gameRoom.gameTimer = null;
            }
            
            if (gameRoom.questionTimer) {
              clearTimeout(gameRoom.questionTimer);
              gameRoom.questionTimer = null;
            }

            // Calculate final results
            const playerResults = gameRoom.players.map(player => {
              const score = gameRoom.playerScores.get(player.id);
              return {
                playerId: player.id,
                username: player.username,
                currentRating: player.rating,
                finalScore: score.score,
                correctAnswers: score.correctAnswers,
                totalTime: score.totalTime,
                maxStreak: score.maxStreak,
                questionsAnswered: score.questionsAnswered
              };
            });

            // Determine winner
            const winner = playerResults.reduce((best, current) => {
              if (current.finalScore > best.finalScore) return current;
              if (current.finalScore === best.finalScore && current.totalTime < best.totalTime) return current;
              return best;
            });

            // Calculate rating changes
            const K = 32; // ELO K-factor
            const ratingChanges = [];

            for (let i = 0; i < playerResults.length; i++) {
              const player = playerResults[i];
              const opponent = playerResults[1 - i];
              
              const expectedScore = 1 / (1 + Math.pow(10, (opponent.currentRating - player.currentRating) / 400));
              const actualScore = player.playerId === winner.playerId ? 1 : 0;
              
              const ratingChange = Math.round(K * (actualScore - expectedScore));
              ratingChanges.push(ratingChange);
            }

            const finalResult = {
              gameId: gameRoom.id,
              finalScores: Object.fromEntries(gameRoom.playerScores),
              winner,
              ratingChanges,
              gameStats: {
                duration: Date.now() - gameRoom.createdAt,
                totalQuestions: gameRoom.gameSettings.questionsPerGame,
                questionsAnswered: gameRoom.currentQuestionIndex,
                finalQuestionMeter: gameRoom.questionMeter
              },
              players: playerResults.map((result, index) => ({
                ...result,
                won: result.playerId === winner.playerId,
                newRating: result.currentRating + ratingChanges[index]
              })),
              finalQuestionMeter: gameRoom.questionMeter
            };

            players.forEach(p => {
              io.to(p.socketId).emit('game-ended', finalResult);
            });
            
            // Update player ratings
            updatePlayerRatings(finalResult.players);
            
            // Clean up
            removeGameRoom(gameRoom.id);
          }
        }, 2000);
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Player requests current game state
  socket.on('get-game-state', () => {
    try {
      const player = getPlayer(socket.id);
      if (!player) throw new Error('Player not found');

      const gameRoom = getPlayerGameRoom(player.id);
      if (!gameRoom) throw new Error('Game room not found');

      socket.emit('game-state-update', {
        gameState: {
          gameId: gameRoom.id,
          state: gameRoom.gameState,
          currentQuestionIndex: gameRoom.currentQuestionIndex,
          totalQuestions: gameRoom.gameSettings.questionsPerGame,
          playerScores: Object.fromEntries(gameRoom.playerScores),
          timeRemaining: Math.max(0, gameRoom.gameSettings.totalGameTime - (Date.now() - gameRoom.createdAt)),
          questionMeter: gameRoom.questionMeter,
          questionMeterController: gameRoom.questionMeterController,
          difficulty: gameRoom.difficulty
        },
        currentQuestion: gameRoom.questions[gameRoom.currentQuestionIndex],
        questionMeter: gameRoom.questionMeter
      });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Player disconnects
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    
    const player = getPlayer(socket.id);
    if (player) {
      // Remove from matchmaking queue
      removeFromQueue(player);
      
      // Handle game room disconnection
      const gameRoom = getPlayerGameRoom(player.id);
      if (gameRoom) {
        gameRoom.gameState = 'completed';
        
        if (gameRoom.gameTimer) {
          clearTimeout(gameRoom.gameTimer);
        }
        if (gameRoom.questionTimer) {
          clearTimeout(gameRoom.questionTimer);
        }
        
        const remainingPlayer = gameRoom.players.find(p => p.id !== player.id);
        if (remainingPlayer) {
          io.to(remainingPlayer.socketId).emit('opponent-disconnected', {
            message: 'Your opponent has disconnected. You win by default!',
            finalQuestionMeter: gameRoom.questionMeter
          });
        }
        removeGameRoom(gameRoom.id);
      }
      
      // Remove player
      removePlayer(socket.id);
    }
  });
});
