class MatchmakingService {
  constructor(playerManager, gameRoomManager) {
    this.playerManager = playerManager;
    this.gameRoomManager = gameRoomManager;
    this.matchmakingQueue = new Map(); // playerId -> { player, searchStartTime, maxRatingDiff }
    this.matchmakingInterval = setInterval(() => this.processMatchmaking(), 2000);
  }

  findMatch(player, onMatchFound) {
    console.log('finding match')
    // Add player to matchmaking queue
    this.matchmakingQueue.set(player.id, {
      player,
      searchStartTime: Date.now(),
      maxRatingDiff: 100, // Start with strict matching
      onMatchFound
    });

    player.isInGame = false;
    
    // Try immediate matching
    this.tryMatchPlayer(player.id);
  }

  processMatchmaking() {
    for (const [playerId, queueData] of this.matchmakingQueue) {
      // Expand search range over time (up to 5 minutes)
      const searchTime = Date.now() - queueData.searchStartTime;
      const timeBasedExpansion = Math.min(searchTime / 1000 / 10, 30); // 3 points per second, max 300
      queueData.maxRatingDiff = Math.min(100 + timeBasedExpansion * 10, 500);

      this.tryMatchPlayer(playerId);
    }
  }

  tryMatchPlayer(playerId) {
    const queueData = this.matchmakingQueue.get(playerId);
    if (!queueData) return;

    const { player, maxRatingDiff, onMatchFound } = queueData;

    // Find potential opponents
    const potentialOpponents = this.playerManager
      .findPlayersInRatingRange(player.rating, maxRatingDiff)
      .filter(p => 
        p.id !== player.id && 
        !p.isInGame && 
        this.matchmakingQueue.has(p.id)
      );

    if (potentialOpponents.length > 0) {
      // Select best opponent (closest rating)
      const opponent = potentialOpponents.reduce((best, current) => {
        const bestDiff = Math.abs(best.rating - player.rating);
        const currentDiff = Math.abs(current.rating - player.rating);
        return currentDiff < bestDiff ? current : best;
      });

      // Create game room
      const gameRoom = this.gameRoomManager.createGameRoom([player, opponent]);
      
      // Mark players as in game
      player.isInGame = true;
      opponent.isInGame = true;

      // Remove from matchmaking queue
      this.matchmakingQueue.delete(player.id);
      this.matchmakingQueue.delete(opponent.id);

      // Notify about match
      onMatchFound(gameRoom);
      const opponentQueueData = this.matchmakingQueue.get(opponent.id);
      if (opponentQueueData) {
        opponentQueueData.onMatchFound(gameRoom);
      }
    }
  }

  removeFromQueue(player) {
    console.log('player removed from queue', player)
    this.matchmakingQueue.delete(player.id);
    player.isInGame = false;
  }

  getQueueSize() {
    return this.matchmakingQueue.size;
  }

  getAverageWaitTime() {
    if (this.matchmakingQueue.size === 0) return 0;
    
    const now = Date.now();
    const totalWaitTime = Array.from(this.matchmakingQueue.values())
      .reduce((sum, queueData) => sum + (now - queueData.searchStartTime), 0);
    
    return Math.round(totalWaitTime / this.matchmakingQueue.size / 1000);
  }

  destroy() {
    if (this.matchmakingInterval) {
      clearInterval(this.matchmakingInterval);
    }
  }
}

module.exports = {MatchmakingService}




// class MatchmakingService {
//     constructor(playerManager, gameRoomManager) {
//         this.playerManager = playerManager;
//         this.gameRoomManager = gameRoomManager;
//         this.matchmakingQueue = [];
//         this.matchmakingTimeout = 30000; // 30 seconds max wait time
//     }

//     findMatch(player, callback) {
//         console.log(`Finding match for player: ${player.username} (Rating: ${player.rating})`);
        
//         // Add player to queue
//         this.matchmakingQueue.push({
//             player,
//             callback,
//             joinedQueueAt: new Date()
//         });

//         this.playerManager.updatePlayerStatus(player.socketId, 'lobby');

//         // Try to find a match immediately
//         this.processMatchmaking();

//         // Set timeout for this player
//         setTimeout(() => {
//             this.handleMatchmakingTimeout(player);
//         }, this.matchmakingTimeout);
//     }

//     processMatchmaking() {
//         while (this.matchmakingQueue.length >= 2) {
//             // Sort queue by rating for better matching
//             this.matchmakingQueue.sort((a, b) => a.player.rating - b.player.rating);

//             const player1Entry = this.matchmakingQueue.shift();
//             let bestMatch = null;
//             let bestMatchIndex = -1;

//             // Find the best match within rating range
//             for (let i = 0; i < this.matchmakingQueue.length; i++) {
//                 const player2Entry = this.matchmakingQueue[i];
//                 const ratingDifference = Math.abs(player1Entry.player.rating - player2Entry.player.rating);
                
//                 // Acceptable rating difference increases with wait time
//                 const waitTime = Date.now() - player1Entry.joinedQueueAt.getTime();
//                 const maxRatingDiff = Math.min(200 + (waitTime / 1000) * 10, 500);

//                 if (ratingDifference <= maxRatingDiff) {
//                     bestMatch = player2Entry;
//                     bestMatchIndex = i;
//                     break;
//                 }
//             }

//             if (bestMatch) {
//                 // Remove the matched player from queue
//                 this.matchmakingQueue.splice(bestMatchIndex, 1);

//                 // Create game room
//                 const gameRoom = this.gameRoomManager.createGameRoom([player1Entry.player, bestMatch.player]);
                
//                 // Update player statuses
//                 this.playerManager.updatePlayerStatus(player1Entry.player.socketId, 'matched');
//                 this.playerManager.updatePlayerStatus(bestMatch.player.socketId, 'matched');

//                 console.log(`Match found: ${player1Entry.player.username} vs ${bestMatch.player.username}`);

//                 // Notify both players
//                 player1Entry.callback(gameRoom);
//                 bestMatch.callback(gameRoom);
//             } else {
//                 // No suitable match found, put player back in queue
//                 this.matchmakingQueue.unshift(player1Entry);
//                 break;
//             }
//         }
//     }

//     handleMatchmakingTimeout(player) {
//         // Remove player from queue if still waiting
//         this.matchmakingQueue = this.matchmakingQueue.filter(entry => 
//             entry.player.socketId !== player.socketId
//         );
        
//         console.log(`Matchmaking timeout for player: ${player.username}`);
//     }

//     removeFromQueue(player) {
//         this.matchmakingQueue = this.matchmakingQueue.filter(entry => 
//             entry.player.socketId !== player.socketId
//         );
//         console.log(`Player removed from matchmaking queue: ${player.username}`);
//     }

//     getQueueStatus() {
//         return {
//             playersInQueue: this.matchmakingQueue.length,
//             averageWaitTime: this.calculateAverageWaitTime()
//         };
//     }

//     calculateAverageWaitTime() {
//         if (this.matchmakingQueue.length === 0) return 0;
        
//         const now = new Date();
//         const totalWaitTime = this.matchmakingQueue.reduce((sum, entry) => {
//             return sum + (now - entry.joinedQueueAt);
//         }, 0);
        
//         return totalWaitTime / this.matchmakingQueue.length / 1000; // seconds
//     }
// }

// module.exports = { MatchmakingService };