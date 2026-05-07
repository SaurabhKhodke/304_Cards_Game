// ============================================================
// Admin Routes - Dashboard, Player Management, Maintenance
// ============================================================
const express = require('express');
const router = express.Router();
const userModel = require('../db/userModel');
const statsModel = require('../db/statsModel');
const gameHistoryModel = require('../db/gameHistoryModel');
const { runSql } = require('../db/database');
const { roomManager } = require('../game/Room');

// Middleware: Extract user and verify Admin Role
function adminMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  const user = userModel.verifyToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  // Make sure they have the admin role
  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied: Requires admin role' });
  }
  req.user = user;
  next();
}

// All routes in this router require admin
router.use(adminMiddleware);

// ============================================================
// GET /api/admin/overview - System Stats
// ============================================================
router.get('/overview', (req, res) => {
  try {
    const totalUsers = userModel.getAllUsers().length;
    const activeRooms = roomManager.getAllRooms().length;
    const liveGames = roomManager.getAllRooms().filter(r => r.gameStarted).length;
    
    // Quick DB counts
    const { queryAll } = require('../db/database');
    
    const gamesPlayedRow = queryAll('SELECT COUNT(*) as c FROM game_history');
    const totalRoundsPlayed = gamesPlayedRow.length > 0 ? gamesPlayedRow[0].c : 0;
    
    res.json({
      totalUsers,
      activeRooms,
      liveGames,
      totalGamesPlayed: totalRoundsPlayed, // Approximate: just counting rounds as games
      totalRoundsPlayed
    });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /api/admin/players - List Players
// ============================================================
router.get('/players', (req, res) => {
  try {
    const users = userModel.getAllUsers();
    res.json(users);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /api/admin/players/:id/edit - Edit Player
// ============================================================
router.post('/players/:id/edit', (req, res) => {
  try {
    const { displayName } = req.body;
    const id = parseInt(req.params.id);
    if (!displayName) return res.status(400).json({ error: 'Display name required' });
    
    const updated = userModel.updateProfile(id, displayName, null);
    res.json({ success: true, user: updated });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /api/admin/players/:id/reset-password - Reset Password
// ============================================================
router.post('/players/:id/reset-password', (req, res) => {
  try {
    const { newPassword } = req.body;
    const id = parseInt(req.params.id);
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }
    
    userModel.updateUserPassword(id, newPassword);
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// DELETE /api/admin/players/:id - Delete Player
// ============================================================
router.delete('/players/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    // Prevent deleting self or ADMIN
    const userToDelete = userModel.getUserById(id);
    if (userToDelete && userToDelete.username === 'ADMIN') {
      return res.status(403).json({ error: 'Cannot delete the ADMIN user' });
    }
    userModel.deleteUser(id);
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /api/admin/players/:id/reset-stats - Reset Player Stats
// ============================================================
router.post('/players/:id/reset-stats', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    runSql('UPDATE stats SET total_marks=0, games_played=0, games_won=0, rounds_played=0, bids_won=0, bids_failed=0, vakhai_won=0, vakhai_lost=0 WHERE user_id = ?', [id]);
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /api/admin/rooms - List Rooms
// ============================================================
router.get('/rooms', (req, res) => {
  try {
    const rooms = roomManager.getAllRooms().map(r => ({
      id: r.id,
      hostId: r.hostId,
      playersCount: (Array.isArray(r.getPublicState().seats) ? r.getPublicState().seats : Object.values(r.getPublicState().seats || {})).filter(s => s).length,
      gameStarted: r.gameStarted,
      phase: r.game ? r.game.phase : null,
      roundNumber: r.game ? r.game.roundNumber : null,
      bidAmount: r.game ? r.game.bidAmount : null,
      vakhaiStake: (r.game && r.game.vakhai) ? r.game.vakhai.vakhaiStake : null,
      currentTurn: r.game ? ((r.getPublicState ? r.getPublicState() : {}).currentTurn ?? r.game?.currentTurn ?? r.game?.state?.currentTurn ?? null) : null
    }));
    res.json(rooms);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /api/admin/rooms/:id/force-end - Force End Room
// ============================================================
router.post('/rooms/:id/force-end', (req, res) => {
  try {
    const roomId = req.params.id;
    const room = roomManager.getRoom(roomId);
    if (room) {
      roomManager.deleteRoom(roomId);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Room not found' });
    }
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /api/admin/maintenance/clear-demo-users
// ============================================================
router.post('/maintenance/clear-demo-users', (req, res) => {
  try {
    const users = userModel.getAllUsers();
    let deletedCount = 0;
    users.forEach(u => {
      if (u.username !== 'ADMIN' && (u.username.toLowerCase().includes('demo') || u.username.toLowerCase().includes('test'))) {
        userModel.deleteUser(u.id);
        deletedCount++;
      }
    });
    res.json({ success: true, deletedCount });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /api/admin/maintenance/reset-all-stats
// ============================================================
router.post('/maintenance/reset-all-stats', (req, res) => {
  try {
    runSql('UPDATE stats SET total_marks=0, games_played=0, games_won=0, rounds_played=0, bids_won=0, bids_failed=0, vakhai_won=0, vakhai_lost=0');
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /api/admin/maintenance/clear-history
// ============================================================
router.post('/maintenance/clear-history', (req, res) => {
  try {
    runSql('DELETE FROM game_history');
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
