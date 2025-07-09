const { v4: uuidv4 } = require("uuid");
const Player = require("../models/Player");

class PlayerManager {
  constructor() {
    this.players = new Map(); // socketId -> Player
    this.playersByRating = new Map(); // rating range -> Set of players
    this.playersById = new Map();
  }

  addPlayer(socketId, playerData) {
    const player = {
      id: uuidv4(),
      socketId,
      username: playerData.username,
      rating: playerData.rating || 1200,
      gamesPlayed: playerData.gamesPlayed || 0,
      wins: playerData.wins || 0,
      losses: playerData.losses || 0,
      joinedAt: Date.now(),
      isInGame: false,
      diff: playerData.diff || "medium",
    };

    this.players.set(socketId, player);
    this.playersById.set(player.id, player);

    this.addToRatingGroup(player);

    return player;
  }

  getPlayer(socketId) {
    console.log(this.players);

    // Convert Map values to array
    const player = [...this.players.values()].find(
      (p) => p.socketId === socketId
    );

    console.log("Found player:", player);
    return player;
  }

  getPlayerById(playerId) {
    return this.playersById.get(playerId);
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (player) {
      this.removeFromRatingGroup(player);
      this.players.delete(socketId);
      this.playersById.delete(player.id);
    }
  }

  addToRatingGroup(player) {
    const ratingRange = this.getRatingRange(player.rating);
    if (!this.playersByRating.has(ratingRange)) {
      this.playersByRating.set(ratingRange, new Set());
    }
    this.playersByRating.get(ratingRange).add(player);
  }

  removeFromRatingGroup(player) {
    const ratingRange = this.getRatingRange(player.rating);
    const group = this.playersByRating.get(ratingRange);
    if (group) {
      group.delete(player);
      if (group.size === 0) {
        this.playersByRating.delete(ratingRange);
      }
    }
  }

  getRatingRange(rating) {
    // Group players in 200-point rating ranges
    return Math.floor(rating / 200) * 200;
  }

  findPlayersInRatingRange(targetRating, maxDifference = 200) {
    const players = [];
    const minRating = targetRating - maxDifference;
    const maxRating = targetRating + maxDifference;

    for (const [ratingRange, playerSet] of this.playersByRating) {
      if (ratingRange >= minRating && ratingRange <= maxRating) {
        for (const player of playerSet) {
          if (
            !player.isInGame &&
            player.rating >= minRating &&
            player.rating <= maxRating
          ) {
            players.push(player);
          }
        }
      }
    }

    return players;
  }

  updatePlayerRatings(gameResults) {
    gameResults.forEach((result) => {
      const player = Array.from(this.players.values()).find(
        (p) => p.id === result.playerId
      );

      if (player) {
        // Remove from old rating group
        this.removeFromRatingGroup(player);

        // Update stats
        player.rating = result.newRating;
        player.gamesPlayed++;
        if (result.won) {
          player.wins++;
        } else {
          player.losses++;
        }

        // Add to new rating group
        this.addToRatingGroup(player);
      }
    });
  }

  getOnlinePlayersCount() {
    return this.players.size;
  }

  getLeaderboard(limit = 10) {
    return Array.from(this.players.values())
      .sort((a, b) => b.rating - a.rating)
      .slice(0, limit)
      .map((player) => ({
        username: player.username,
        rating: player.rating,
        gamesPlayed: player.gamesPlayed,
        wins: player.wins,
        losses: player.losses,
        winRate:
          player.gamesPlayed > 0
            ? ((player.wins / player.gamesPlayed) * 100).toFixed(1)
            : 0,
      }));
  }
}

module.exports = { PlayerManager };

// // services/PlayerManager.js
// const { v4: uuidv4 } = require('uuid');

// class PlayerManager {
//     constructor() {
//         this.players = new Map(); // socketId -> player object
//         this.playersByUserId = new Map(); // userId -> player object
//     }

//     addPlayer(socketId, playerData) {
//         const player = {
//             id: uuidv4(),
//             socketId,
//             username: playerData.username,
//             skillLevel: playerData.skillLevel || 'intermediate',
//             rating: playerData.rating || 1000,
//             email: playerData.email,
//             country: playerData.country,
//             pr: playerData.pr || {
//                 practice: { easy: 1000, medium: 1000, hard: 1000 },
//                 pvp: { easy: 1000, medium: 1000, hard: 1000 }
//             },
//             score: 0,
//             streak: 0,
//             joinedAt: new Date(),
//             status: 'lobby' // lobby, matched, in-game, disconnected
//         };

//         this.players.set(socketId, player);
//         if (playerData.userId) {
//             this.playersByUserId.set(playerData.userId, player);
//         }

//         console.log(`Player added: ${player.username} (${socketId})`);
//         return player;
//     }

//     getPlayer(socketId) {
//         return this.players.get(socketId);
//     }

//     getPlayerByUserId(userId) {
//         return this.playersByUserId.get(userId);
//     }

//     removePlayer(socketId) {
//         const player = this.players.get(socketId);
//         if (player) {
//             this.players.delete(socketId);
//             // Remove from userId map if exists
//             for (const [userId, p] of this.playersByUserId.entries()) {
//                 if (p.socketId === socketId) {
//                     this.playersByUserId.delete(userId);
//                     break;
//                 }
//             }
//             console.log(`Player removed: ${player.username} (${socketId})`);
//         }
//         return player;
//     }

//     updatePlayerStatus(socketId, status) {
//         const player = this.players.get(socketId);
//         if (player) {
//             player.status = status;
//         }
//     }

//     updatePlayerRatings(playersResults) {
//         playersResults.forEach(result => {
//             const player = this.getPlayer(result.socketId);
//             if (player) {
//                 // Update rating based on game result
//                 const ratingChange = this.calculateRatingChange(result);
//                 player.rating += ratingChange;
//                 player.rating = Math.max(100, player.rating); // Minimum rating

//                 console.log(`Updated rating for ${player.username}: ${player.rating} (${ratingChange >= 0 ? '+' : ''}${ratingChange})`);
//             }
//         });
//     }

//     calculateRatingChange(result) {
//         // Simple ELO-like rating system
//         const baseChange = 30;
//         const performanceMultiplier = result.score > result.opponentScore ? 1 : -1;
//         const scoreDifferenceBonus = Math.abs(result.score - result.opponentScore) * 2;

//         return performanceMultiplier * (baseChange + scoreDifferenceBonus);
//     }

//     getAllPlayers() {
//         return Array.from(this.players.values());
//     }

//     getPlayersInLobby() {
//         return Array.from(this.players.values()).filter(p => p.status === 'lobby');
//     }
// }

// module.exports = { PlayerManager };
