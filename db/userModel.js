// ============================================================
// User Model - Registration, Login, JWT Auth
// Uses sql.js database helpers
// ============================================================
const { queryAll, queryOne, runSql } = require('./database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'family-304-game-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d';

const userModel = {
  createUser(username, password, displayName) {
    const existing = queryOne('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) {
      throw new Error('Username already taken');
    }
    const passwordHash = bcrypt.hashSync(password, 10);
    const result = runSql(
      'INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)',
      [username, passwordHash, displayName || username]
    );
    // Create initial stats row
    runSql('INSERT INTO stats (user_id) VALUES (?)', [result.lastInsertRowid]);
    return { id: result.lastInsertRowid, username, displayName: displayName || username };
  },

  authenticateUser(username, password) {
    const user = queryOne('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) throw new Error('Invalid username or password');
    if (!bcrypt.compareSync(password, user.password_hash)) {
      throw new Error('Invalid username or password');
    }
    const token = jwt.sign(
      { id: user.id, username: user.username, displayName: user.display_name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    return {
      token,
      user: { id: user.id, username: user.username, displayName: user.display_name, profilePic: user.profile_pic }
    };
  },

  verifyToken(token) {
    try { return jwt.verify(token, JWT_SECRET); }
    catch (e) { return null; }
  },

  getUserById(id) {
    return queryOne('SELECT id, username, display_name as displayName, profile_pic as profilePic, created_at FROM users WHERE id = ?', [id]);
  },

  getUserByUsername(username) {
    return queryOne('SELECT id, username, display_name as displayName, profile_pic as profilePic, created_at FROM users WHERE username = ?', [username]);
  },

  updateProfile(id, displayName, profilePic) {
    const fields = [];
    const params = [];
    if (displayName !== undefined && displayName !== null) {
      fields.push('display_name = ?');
      params.push(displayName);
    }
    if (profilePic !== undefined && profilePic !== null) {
      fields.push('profile_pic = ?');
      params.push(profilePic);
    }
    if (fields.length > 0) {
      params.push(id);
      runSql(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
    }
    return this.getUserById(id);
  }
};

module.exports = userModel;
