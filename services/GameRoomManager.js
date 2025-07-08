const { GameRoom } = require('./GameRoom.js');

class GameRoomManager {
  constructor(questionService, io) {
    this.questionService = questionService;
    this.diff = 'medium';
    this.gameRooms = new Map(); // roomId -> GameRoom
    this.playerToRoom = new Map(); // playerId -> roomId
    this.io = io;
  }

  createGameRoom(players) {
    const gameRoom = new GameRoom(players, this.questionService);
    gameRoom.bindIO(this.io);
    
    this.gameRooms.set(gameRoom.id, gameRoom);
    
    // Map players to room
    players.forEach(player => {
      this.playerToRoom.set(player.id, gameRoom.id);
    });

    return gameRoom;
  }

  getGameRoom(roomId) {
    return this.gameRooms.get(roomId);
  }

  getPlayerGameRoom(playerId) {
    const roomId = this.playerToRoom.get(playerId);
    return roomId ? this.gameRooms.get(roomId) : null;
  }

  removeGameRoom(roomId) {
    const gameRoom = this.gameRooms.get(roomId);
    if (gameRoom) {
      // Remove player mappings
      gameRoom.getPlayers().forEach(player => {
        this.playerToRoom.delete(player.id);
      });
      
      this.gameRooms.delete(roomId);
    }
  }

  getActiveGamesCount() {
    return this.gameRooms.size;
  }

  getAllGameRooms() {
    return Array.from(this.gameRooms.values());
  }
}

module.exports = {GameRoomManager}




// const { v4: uuidv4 } = require('uuid');

// class GameRoomManager {
//     constructor(questionService) {
//         this.gameRooms = new Map(); // roomId -> GameRoom
//         this.playerRooms = new Map(); // playerId -> roomId
//         this.questionService = questionService;
//     }

//     createGameRoom(players) {
//         const gameRoom = new GameRoom(players, this.questionService);
//         this.gameRooms.set(gameRoom.id, gameRoom);
        
//         // Map players to room
//         players.forEach(player => {
//             this.playerRooms.set(player.id, gameRoom.id);
//         });

//         console.log(`Game room created: ${gameRoom.id} with players: ${players.map(p => p.username).join(', ')}`);
//         return gameRoom;
//     }

//     getGameRoom(roomId) {
//         return this.gameRooms.get(roomId);
//     }

//     getPlayerGameRoom(playerId) {
//         const roomId = this.playerRooms.get(playerId);
//         return roomId ? this.gameRooms.get(roomId) : null;
//     }

//     removeGameRoom(roomId) {
//         const gameRoom = this.gameRooms.get(roomId);
//         if (gameRoom) {
//             // Remove player mappings
//             gameRoom.players.forEach(player => {
//                 this.playerRooms.delete(player.id);
//             });
            
//             this.gameRooms.delete(roomId);
//             console.log(`Game room removed: ${roomId}`);
//         }
//     }

//     getAllGameRooms() {
//         return Array.from(this.gameRooms.values());
//     }

//     getActiveGamesCount() {
//         return this.gameRooms.size;
//     }
// }

// class GameRoom {
//     constructor(players, questionService) {
//         this.id = uuidv4();
//         this.players = players;
//         this.questionService = questionService;
//         this.status = 'waiting'; // waiting, in-progress, completed
//         this.questionMeter = 50; // Start at middle
//         this.questionMeterController = null; // Player who controls the meter
//         this.currentQuestionIndex = 0;
//         this.maxQuestions = 10;
//         this.questions = [];
//         this.playerAnswers = new Map(); // questionIndex -> {playerId: {answer, timeSpent, timestamp}}
//         this.gameStartTime = null;
//         this.gameEndTime = null;
//         this.createdAt = new Date();

//         // Initialize player game data
//         this.players.forEach(player => {
//             player.gameData = {
//                 score: 0,
//                 streak: 0,
//                 correctAnswers: 0,
//                 totalAnswers: 0,
//                 averageResponseTime: 0,
//                 hasAnsweredCurrent: false
//             };
//         });

//         console.log(`GameRoom created: ${this.id}`);
//     }

//     startGame() {
//         this.status = 'in-progress';
//         this.gameStartTime = new Date();
        
//         // Generate first question based on lower rated player
//         this.generateNextQuestion();
        
//         console.log(`Game started in room: ${this.id}`);
//     }

//     generateNextQuestion() {
//         // Find the player with lower rating for question difficulty
//         const lowerRatedPlayer = this.players.reduce((min, player) => 
//             player.rating < min.rating ? player : min
//         );

//         // Determine difficulty based on rating
//         let difficulty = 'medium';
//         if (lowerRatedPlayer.rating < 800) {
//             difficulty = 'easy';
//         } else if (lowerRatedPlayer.rating > 1500) {
//             difficulty = 'hard';
//         }

//         // Get question using the question service
//         const question = this.questionService.getQuestionForGame(
//             difficulty,
//             lowerRatedPlayer.rating,
//             this.questionMeter
//         );

//         if (question) {
//             this.questions.push(question);
//             console.log(`Generated question ${this.currentQuestionIndex + 1} for room ${this.id}`);
//         } else {
//             console.error(`Failed to generate question for room ${this.id}`);
//         }

//         // Reset player answer status
//         this.players.forEach(player => {
//             player.gameData.hasAnsweredCurrent = false;
//         });
//     }

//     getCurrentQuestion() {
//         return this.questions[this.currentQuestionIndex] || null;
//     }

//     submitAnswer(playerId, answer, timeSpent) {
//         const player = this.players.find(p => p.id === playerId);
//         if (!player) {
//             throw new Error('Player not found in game room');
//         }

//         if (player.gameData.hasAnsweredCurrent) {
//             throw new Error('Player has already answered this question');
//         }

//         const currentQuestion = this.getCurrentQuestion();
//         if (!currentQuestion) {
//             throw new Error('No current question available');
//         }

//         // Record the answer
//         if (!this.playerAnswers.has(this.currentQuestionIndex)) {
//             this.playerAnswers.set(this.currentQuestionIndex, {});
//         }

//         const questionAnswers = this.playerAnswers.get(this.currentQuestionIndex);
//         const isFirstToAnswer = Object.keys(questionAnswers).length === 0;
        
//         questionAnswers[playerId] = {
//             answer,
//             timeSpent,
//             timestamp: new Date(),
//             isCorrect: this.checkAnswer(answer, currentQuestion.answer)
//         };

//         player.gameData.hasAnsweredCurrent = true;
//         player.gameData.totalAnswers++;

//         // Update question meter based on who answered first and correctness
//         let questionMeterDelta = 0;
//         if (questionAnswers[playerId].isCorrect) {
//             player.gameData.correctAnswers++;
//             player.gameData.streak++;
            
//             // Update score based on streak
//             this.updatePlayerScore(player);
            
//             if (isFirstToAnswer) {
//                 questionMeterDelta = player === this.players[0] ? -2 : 2;
//                 this.questionMeterController = playerId;
//             } else {
//                 questionMeterDelta = player === this.players[0] ? -1 : 1;
//             }
//         } else {
//             player.gameData.streak = 0;
//             if (isFirstToAnswer) {
//                 questionMeterDelta = player === this.players[0] ? 1 : -1;
//             }
//         }

//         // Update question meter (keep within bounds)
//         this.questionMeter = Math.max(0, Math.min(100, this.questionMeter + questionMeterDelta));

//         return {
//             isCorrect: questionAnswers[playerId].isCorrect,
//             isFirstToAnswer,
//             questionMeter: this.questionMeter,
//             questionMeterController: this.questionMeterController,
//             playerScore: player.gameData.score,
//             playerStreak: player.gameData.streak
//         };
//     }

//     updatePlayerScore(player) {
//         const streak = player.gameData.streak;
//         let scoreIncrease = 1; // Base score for correct answer

//         if (streak === 3) {
//             scoreIncrease = 3;
//         } else if (streak === 5) {
//             scoreIncrease = 5;
//         } else if (streak === 10) {
//             scoreIncrease = 10;
//         } else if (streak > 10 && streak % 10 === 0) {
//             scoreIncrease = 10;
//         }

//         player.gameData.score += scoreIncrease;
//     }

//     checkAnswer(givenAnswer, correctAnswer) {
//         return String(givenAnswer).trim().toLowerCase() === String(correctAnswer).trim().toLowerCase();
//     }

//     isQuestionComplete() {
//         const questionAnswers = this.playerAnswers.get(this.currentQuestionIndex) || {};
//         return Object.keys(questionAnswers).length === this.players.length;
//     }

//     completeQuestion() {
//         const questionAnswers = this.playerAnswers.get(this.currentQuestionIndex) || {};
//         const currentQuestion = this.getCurrentQuestion();
        
//         const results = {
//             questionIndex: this.currentQuestionIndex,
//             question: currentQuestion,
//             answers: questionAnswers,
//             correctAnswer: currentQuestion.answer,
//             playerResults: []
//         };

//         // Compile results for each player
//         this.players.forEach(player => {
//             const playerAnswer = questionAnswers[player.id];
//             results.playerResults.push({
//                 playerId: player.id,
//                 username: player.username,
//                 answer: playerAnswer?.answer,
//                 isCorrect: playerAnswer?.isCorrect || false,
//                 timeSpent: playerAnswer?.timeSpent || 0,
//                 score: player.gameData.score,
//                 streak: player.gameData.streak
//             });
//         });

//         console.log(`Question ${this.currentQuestionIndex + 1} completed in room ${this.id}`);
//         return results;
//     }

//     nextQuestion() {
//         this.currentQuestionIndex++;
//         if (this.currentQuestionIndex < this.maxQuestions) {
//             this.generateNextQuestion();
//         }
//     }

//     hasMoreQuestions() {
//         return this.currentQuestionIndex < this.maxQuestions - 1;
//     }

//     endGame() {
//         this.status = 'completed';
//         this.gameEndTime = new Date();
        
//         const finalResults = {
//             gameId: this.id,
//             duration: this.gameEndTime - this.gameStartTime,
//             totalQuestions: this.currentQuestionIndex + 1,
//             finalQuestionMeter: this.questionMeter,
//             players: this.players.map(player => ({
//                 id: player.id,
//                 socketId: player.socketId,
//                 username: player.username,
//                 score: player.gameData.score,
//                 correctAnswers: player.gameData.correctAnswers,
//                 totalAnswers: player.gameData.totalAnswers,
//                 accuracy: player.gameData.totalAnswers > 0 ? 
//                     (player.gameData.correctAnswers / player.gameData.totalAnswers * 100).toFixed(1) : 0,
//                 finalStreak: player.gameData.streak
//             }))
//         };

//         // Determine winner
//         const sortedPlayers = [...finalResults.players].sort((a, b) => b.score - a.score);
//         finalResults.winner = sortedPlayers[0];
//         finalResults.rankings = sortedPlayers;

//         console.log(`Game ended in room ${this.id}. Winner: ${finalResults.winner.username}`);
//         return finalResults;
//     }

//     handlePlayerDisconnect(playerId) {
//         const player = this.players.find(p => p.id === playerId);
//         if (player) {
//             player.status = 'disconnected';
//             console.log(`Player ${player.username} disconnected from room ${this.id}`);
//         }
//     }

//     getGameState() {
//         return {
//             roomId: this.id,
//             status: this.status,
//             currentQuestionIndex: this.currentQuestionIndex,
//             totalQuestions: this.maxQuestions,
//             questionMeter: this.questionMeter,
//             questionMeterController: this.questionMeterController,
//             players: this.players.map(player => ({
//                 id: player.id,
//                 username: player.username,
//                 score: player.gameData.score,
//                 streak: player.gameData.streak,
//                 correctAnswers: player.gameData.correctAnswers,
//                 totalAnswers: player.gameData.totalAnswers,
//                 hasAnsweredCurrent: player.gameData.hasAnsweredCurrent
//             })),
//             gameStartTime: this.gameStartTime,
//             timeElapsed: this.gameStartTime ? Date.now() - this.gameStartTime.getTime() : 0
//         };
//     }

//     getPublicData() {
//         return {
//             id: this.id,
//             status: this.status,
//             playerCount: this.players.length,
//             currentQuestion: this.currentQuestionIndex + 1,
//             totalQuestions: this.maxQuestions
//         };
//     }

//     getPlayers() {
//         return this.players;
//     }
// }

// module.exports = { GameRoomManager };
