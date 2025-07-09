const { MatchmakingService } = require("../services/MatchmakingService");
const { GameRoomManager } = require("../services/GameRoomManager");
const { PlayerManager } = require("../services/PlayerManager");
const { QuestionService } = require("../services/QuestionService");

module.exports = function registerSocketHandlers(io) {
  const playerManager = new PlayerManager();
  const questionService = new QuestionService();
  const gameRoomManager = new GameRoomManager(questionService, io);
  const matchmakingService = new MatchmakingService(
    playerManager,
    gameRoomManager
  );

  io.on("connection", (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Player joins the lobby
    socket.on("join-lobby", (playerData) => {
      try {
        const player = playerManager.addPlayer(socket.id, playerData);
        socket.emit("lobby-joined", { success: true, player });
        console.log('player joined lobby', playerData)

        // Start matchmaking
        matchmakingService.findMatch(player, (gameRoom) => {
          console.log('match found')
          matchmakingService.removeFromQueue(player);
          console.log(gameRoom.getOpposingPlayer(player.id))
          matchmakingService.removeFromQueue(
            gameRoom.getOpposingPlayer(player.id)
          );

          console.log('before gameroom player get call');
          // Notify both players about the match
          const players = gameRoom.getPlayers();
          console.log(players)
          players.forEach((p) => {
            console.log(p)
            io.to(p.socketId).emit("match-found", {
              gameRoom: gameRoom.getPublicData(),
              opponent: players.find((player) => player.id !== p.id),
              initialQuestionMeter: gameRoom.questionMeter,
            });
            console.log('match found')
          });

          // Start the game after a brief delay
          setTimeout(() => {
            gameRoom.startGame();
            console.log('GAME STARTED')
            players.forEach((p) => {
      
              io.to(p.socketId).emit("game-started", {
                gameState: gameRoom.getGameState(),
                currentQuestion: gameRoom.getCurrentQuestion(),
              });
            });
          }, 3000);
        });
      } catch (error) {
        socket.emit("error", { message: error.message });
      }
    });

    // Player submits an answer
    // socket.on("submit-answer", (data) => {
    //   try {
    //     const player = playerManager.getPlayer(socket.id);
    //     if (!player) throw new Error("Player not found");

    //     const gameRoom = gameRoomManager.getPlayerGameRoom(player.id);
    //     if (!gameRoom) throw new Error("Game room not found");

    //     const result = gameRoom.submitAnswer(
    //       player.id,
    //       data.answer,
    //       data.timeSpent
    //     );

    //     // Notify both players about the answer submission
    //     const players = gameRoom.getPlayers();
    //     players.forEach((p) => {
    //       io.to(p.socketId).emit("answer-submitted", {
    //         playerId: player.id,
    //         result: result,
    //         gameState: gameRoom.getGameState(),
    //         questionMeterUpdate: {
    //           newQM: result.questionMeter,
    //           controller: result.questionMeterController,
    //           isFirstToAnswer: result.isFirstToAnswer,
    //         },
    //       });
    //     });

    //     // Check if question is complete (both players answered or time up)
    //     if (gameRoom.isQuestionComplete()) {
    //       const questionResult = gameRoom.completeQuestion();
    //       players.forEach((p) => {
    //         io.to(p.socketId).emit("question-completed", {
    //           ...questionResult,
    //           questionMeterInfo: {
    //             currentQM: gameRoom.questionMeter,
    //             controller: gameRoom.questionMeterController,
    //           },
    //         });
    //       });

    //       // Move to next question or end game
    //       setTimeout(() => {
    //         if (gameRoom.hasMoreQuestions()) {
    //           gameRoom.nextQuestion();
    //           const nextQuestion = gameRoom.getCurrentQuestion();
    //           players.forEach((p) => {
    //             io.to(p.socketId).emit("next-question", {
    //               question: nextQuestion,
    //               gameState: gameRoom.getGameState(),
    //               questionMeter: gameRoom.questionMeter,
    //             });
    //           });
    //         } else {
    //           const finalResult = gameRoom.endGame();
    //           players.forEach((p) => {
    //             io.to(p.socketId).emit("game-ended", finalResult);
    //           });

    //           // Update player ratings
    //           playerManager.updatePlayerRatings(finalResult.players);

    //           // Clean up
    //           gameRoomManager.removeGameRoom(gameRoom.id);
    //         }
    //       }, 2000);
    //     }
    //   } catch (error) {
    //     socket.emit("error", { message: error.message });
    //   }
    // });

    socket.on("submit-answer", (data) => {
     
      try {
         console.log(data)
        // const player = playerManager.getPlayer(data.userName);
        const player = playerManager.getPlayer(socket.id);
        console.log(player, socket.id)
        if (!player) throw new Error("Player not found");

        const gameRoom = gameRoomManager.getPlayerGameRoom(player.id);
        if (!gameRoom) throw new Error("Game room not found");

        // 1) Record the answer and QM changes
        const result = gameRoom.submitAnswer(

          player.id,
          data.answer,
          data.timeSpent
        );

        // 2) Broadcast “answer-submitted” to both players
        // gameRoom.getPlayers().forEach((p) => {
        //   io.to(p.socketId).emit("answer-submitted", {
        //     playerId: player.id,
        //     result,
        //     gameState: gameRoom.getGameState(),
        //   });
        // });

        // 3) Immediately generate and send the next question for the answerer
        gameRoom.emitNextQuestion(player.id);
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    // Player requests current game state
    socket.on("get-game-state", () => {
      try {
        const player = playerManager.getPlayer(socket.id);
        if (!player) throw new Error("Player not found");

        const gameRoom = gameRoomManager.getPlayerGameRoom(player.id);
        if (!gameRoom) throw new Error("Game room not found");

        socket.emit("game-state-update", {
          gameState: gameRoom.getGameState(),
          currentQuestion: gameRoom.getCurrentQuestion(),
          questionMeter: gameRoom.questionMeter,
        });
      } catch (error) {
        socket.emit("error", { message: error.message });
      }
    });

    // Player disconnects
    socket.on("disconnect", () => {
      console.log(`Player disconnected: ${socket.id}`);

      const player = playerManager.getPlayer(socket.id);
      if (player) {
        // Remove from matchmaking queue
        matchmakingService.removeFromQueue(player);

        // Handle game room disconnection
        const gameRoom = gameRoomManager.getPlayerGameRoom(player.id);
        if (gameRoom) {
          gameRoom.handlePlayerDisconnect(player.id);
          const remainingPlayer = gameRoom
            .getPlayers()
            .find((p) => p.id !== player.id);
          if (remainingPlayer) {
            io.to(remainingPlayer.socketId).emit("opponent-disconnected", {
              message: "Your opponent has disconnected. You win by default!",
              finalQuestionMeter: gameRoom.questionMeter,
            });
          }
          gameRoomManager.removeGameRoom(gameRoom.id);
        }

        // Remove player
        playerManager.removePlayer(socket.id);
      }
    });
  });
};
