// ============================================================
// Stats Model - Player statistics & leaderboard (sql.js)
// ============================================================
const { queryAll, queryOne, runSql } = require('./database');

const statsModel = {
  getPlayerStats(userId) {
    return queryOne(`
      SELECT s.*, u.display_name as displayName, u.username
      FROM stats s JOIN users u ON u.id = s.user_id
      WHERE s.user_id = ?
    `, [userId]);
  },

  getLeaderboard(limit = 20) {
    return queryAll(`
      SELECT s.*, u.display_name as displayName, u.username
      FROM stats s JOIN users u ON u.id = s.user_id
      ORDER BY s.total_marks DESC LIMIT ?
    `, [limit]);
  },

  updateStats(userId, roundResult) {
    const updates = [];
    const params = [];

    updates.push('total_marks = total_marks + ?');
    params.push(roundResult.marks || 0);
    updates.push('rounds_played = rounds_played + 1');

    if (roundResult.gameEnded) {
      updates.push('games_played = games_played + 1');
      if (roundResult.won) updates.push('games_won = games_won + 1');
    }
    if (roundResult.wasBidder) {
      if (roundResult.bidSuccess) updates.push('bids_won = bids_won + 1');
      else updates.push('bids_failed = bids_failed + 1');
    }
    if (roundResult.vakhaiWon) updates.push('vakhai_won = vakhai_won + 1');
    if (roundResult.vakhaiLost) updates.push('vakhai_lost = vakhai_lost + 1');

    params.push(userId);
    runSql(`UPDATE stats SET ${updates.join(', ')} WHERE user_id = ?`, params);
  }
};

module.exports = statsModel;
