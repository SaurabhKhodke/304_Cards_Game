// ============================================================
// Game History Model - Persist round results (sql.js)
// ============================================================
const { queryAll, runSql } = require('./database');

const gameHistoryModel = {
  saveRound(roomId, roundData) {
    return runSql(`
      INSERT INTO game_history (room_id, round_number, players, bid_winner_id, bid_amount, hukum_suit, partner_card, scores, winner_team)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      roomId, roundData.roundNumber, JSON.stringify(roundData.players),
      roundData.bidWinnerId, roundData.bidAmount, roundData.hukumSuit,
      roundData.partnerCard, JSON.stringify(roundData.scores), roundData.winnerTeam
    ]);
  },

  getGameHistory(userId, limit = 50) {
    return queryAll(`SELECT * FROM game_history WHERE players LIKE ? ORDER BY created_at DESC LIMIT ?`,
      [`%"${userId}"%`, limit]);
  },

  getRoomHistory(roomId) {
    return queryAll(`SELECT * FROM game_history WHERE room_id = ? ORDER BY round_number ASC`, [roomId]);
  }
};

module.exports = gameHistoryModel;
