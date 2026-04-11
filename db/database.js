// ============================================================
// 304 Card Game - Database Initialization (sql.js - pure JS SQLite)
// ============================================================
const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, '304game.db');

let db = null;

/**
 * Initialize the database (must be awaited before use)
 */
async function initDatabase() {
  const SQL = await initSqlJs();
  
  // Load existing database or create new one
  try {
    if (fs.existsSync(dbPath)) {
      const fileBuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }
  } catch (e) {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      profile_pic TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Upgrade path for existing databases
  try { db.run('ALTER TABLE users ADD COLUMN profile_pic TEXT'); } catch (e) {}
  db.run(`
    CREATE TABLE IF NOT EXISTS stats (
      user_id INTEGER PRIMARY KEY,
      total_marks INTEGER DEFAULT 0,
      games_played INTEGER DEFAULT 0,
      games_won INTEGER DEFAULT 0,
      rounds_played INTEGER DEFAULT 0,
      bids_won INTEGER DEFAULT 0,
      bids_failed INTEGER DEFAULT 0,
      vakhai_won INTEGER DEFAULT 0,
      vakhai_lost INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS game_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      round_number INTEGER NOT NULL,
      players TEXT NOT NULL,
      bid_winner_id INTEGER,
      bid_amount INTEGER,
      hukum_suit TEXT,
      partner_card TEXT,
      scores TEXT NOT NULL,
      winner_team TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Auto-save every 30 seconds
  setInterval(() => saveDatabase(), 30000);

  console.log('Database initialized');
  return db;
}

/**
 * Save database to disk
 */
function saveDatabase() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (e) {
    console.error('Error saving database:', e.message);
  }
}

/**
 * Get the database instance
 */
function getDb() {
  return db;
}

// Helper: run a query and return rows as objects
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// Helper: get one row
function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// Helper: run an insert/update and return changes
function runSql(sql, params = []) {
  db.run(sql, params);
  // Get last insert id
  const result = db.exec('SELECT last_insert_rowid() as id');
  const lastId = result.length > 0 ? result[0].values[0][0] : 0;
  return { lastInsertRowid: lastId };
}

module.exports = { initDatabase, getDb, saveDatabase, queryAll, queryOne, runSql };
