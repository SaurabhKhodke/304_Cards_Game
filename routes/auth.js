// ============================================================
// Auth Routes - Login, Register, Profile, Stats
// ============================================================
const express = require('express');
const router = express.Router();
const userModel = require('../db/userModel');
const statsModel = require('../db/statsModel');

// Middleware: Extract user from JWT token
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  const user = userModel.verifyToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  req.user = user;
  next();
}

// ============================================================
// POST /api/auth/register
// ============================================================
router.post('/register', (req, res) => {
  try {
    const { username, password, displayName } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be 3-20 characters' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }
    const user = userModel.createUser(username, password, displayName);
    const auth = userModel.authenticateUser(username, password);
    res.json(auth);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================
// POST /api/auth/login
// ============================================================
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    const auth = userModel.authenticateUser(username, password);
    res.json(auth);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// ============================================================
// POST /api/auth/profile - Update profile
// ============================================================
router.post('/profile', authMiddleware, (req, res) => {
  try {
    const { displayName, profilePic } = req.body;
    const updatedUser = userModel.updateProfile(req.user.id, displayName, profilePic);
    res.json(updatedUser);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================
// GET /api/auth/me - Current user profile
// ============================================================
router.get('/me', authMiddleware, (req, res) => {
  const user = userModel.getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// ============================================================
// GET /api/stats/me - Current user's stats
// ============================================================
router.get('/stats/me', authMiddleware, (req, res) => {
  const stats = statsModel.getPlayerStats(req.user.id);
  res.json(stats || {});
});

// ============================================================
// GET /api/stats/leaderboard - Top players
// ============================================================
router.get('/stats/leaderboard', (req, res) => {
  const leaderboard = statsModel.getLeaderboard();
  res.json(leaderboard);
});

module.exports = { router, authMiddleware };
