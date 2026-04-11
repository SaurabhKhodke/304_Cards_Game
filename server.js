// ============================================================
// 304 Card Game - Server Entry Point
// Express + Socket.IO + SQLite (sql.js)
// ============================================================
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cookieParser = require('cookie-parser');

// Database (async init)
const { initDatabase, saveDatabase } = require('./db/database');

// Game modules
const { roomManager } = require('./game/Room');
const { GameEngine, PHASES } = require('./game/GameEngine');

// ============================================================
// Boot the server (async to allow DB init)
// ============================================================
async function boot() {
  // Initialize database first
  await initDatabase();

  // Now we can require models that depend on DB being ready
  const userModel = require('./db/userModel');
  const statsModel = require('./db/statsModel');
  const gameHistoryModel = require('./db/gameHistoryModel');
  const { router: authRouter } = require('./routes/auth');

  // ============================================================
  // Express Setup
  // ============================================================
  const app = express();
  const server = http.createServer(app);

  app.use(express.json());
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/api/auth', authRouter);

  // ============================================================
  // Socket.IO Setup
  // ============================================================
  const io = new Server(server, {
    cors: { origin: '*' },
    pingTimeout: 30000,
    pingInterval: 10000
  });

  // Authenticate socket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));
    const user = userModel.verifyToken(token);
    if (!user) return next(new Error('Invalid token'));
    // Always refetch latest user state (e.g. if profile edits happened)
    const latestUser = userModel.getUserById(user.id);
    if (!latestUser) return next(new Error('User not found'));
    socket.user = latestUser;
    next();
  });

  // ============================================================
  // Socket.IO Event Handlers
  // ============================================================
  io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.user.displayName} (${socket.id})`);

    // ROOM: Create
    socket.on('room:create', (callback) => {
      try {
        const room = roomManager.createRoom(socket.user.id, socket.user.displayName);
        socket.join(room.id);
        socket.roomId = room.id;
        callback({ success: true, roomId: room.id });
        console.log(`Room created: ${room.id} by ${socket.user.displayName}`);
      } catch (err) { callback({ success: false, error: err.message }); }
    });

    // ROOM: Join
    socket.on('room:join', (roomId, callback) => {
      try {
        const room = roomManager.getRoom(roomId);
        if (!room) return callback({ success: false, error: 'Room not found' });

        const reconnectedSeat = room.handleReconnect(socket.user.id, socket.id);
        if (reconnectedSeat) {
          socket.join(room.id);
          socket.roomId = room.id;
          io.to(room.id).emit('room:update', room.getPublicState());
          if (room.game) socket.emit('game:state', room.game.getStateForPlayer(reconnectedSeat));
          return callback({ success: true, room: room.getPublicState(), reconnected: true, seat: reconnectedSeat });
        }

        if (room.isFull()) return callback({ success: false, error: 'Room is full' });
        socket.join(room.id);
        socket.roomId = room.id;
        callback({ success: true, room: room.getPublicState() });
        io.to(room.id).emit('room:update', room.getPublicState());
      } catch (err) { callback({ success: false, error: err.message }); }
    });

    // ROOM: Take Seat
    socket.on('room:takeSeat', (seatNumber, callback) => {
      try {
        const room = roomManager.getRoom(socket.roomId);
        if (!room) return callback({ success: false, error: 'Not in a room' });
        if (room.gameStarted) return callback({ success: false, error: 'Game already started' });

        const result = room.takeSeat(seatNumber, socket.user.id, socket.user.displayName, socket.id, socket.user.profilePic);
        if (!result.success) return callback(result);

        callback({ success: true, seat: seatNumber });
        io.to(room.id).emit('room:update', room.getPublicState());

        if (room.isFull()) startGame(room);
      } catch (err) { callback({ success: false, error: err.message }); }
    });

    // ROOM: Leave Seat
    socket.on('room:leaveSeat', (callback) => {
      try {
        const room = roomManager.getRoom(socket.roomId);
        if (!room) return callback({ success: false, error: 'Not in a room' });
        if (room.gameStarted) return callback({ success: false, error: 'Game in progress' });
        room.leaveSeat(socket.id);
        callback({ success: true });
        io.to(room.id).emit('room:update', room.getPublicState());
      } catch (err) { callback({ success: false, error: err.message }); }
    });

    // GAME: Vakhai
    socket.on('game:vakhai', ({ action, stake }, callback) => {
      try {
        const room = roomManager.getRoom(socket.roomId);
        if (!room || !room.game) return callback({ success: false, error: 'No active game' });
        const seat = room.getSeatBySocket(socket.id);
        if (!seat) return callback({ success: false, error: 'Not seated' });

        const result = room.game.handleVakhaiAction(seat, action, stake);
        if (!result.success) return callback(result);
        callback({ success: true });
        io.to(room.id).emit('game:vakhaiUpdate', result.state);

        if (result.completed) {
          if (result.results && result.results.length > 0) {
            io.to(room.id).emit('game:vakhaiResults', result.results);
          }
          setTimeout(() => {
            room.game.dealSecondHand();
            for (let s = 1; s <= 4; s++) {
              const ps = getSocketByUserId(room, s);
              if (ps) ps.emit('game:cardsDealt', { phase: 'second', hand: room.game.hands[s] });
            }
            setTimeout(() => {
              const biddingState = room.game.startBidding();
              io.to(room.id).emit('game:biddingStart', biddingState);
            }, 2000);
          }, 2000);
        }
      } catch (err) { callback({ success: false, error: err.message }); }
    });

    // GAME: Bidding
    socket.on('game:bid', ({ action, amount }, callback) => {
      try {
        const room = roomManager.getRoom(socket.roomId);
        if (!room || !room.game) return callback({ success: false, error: 'No active game' });
        const seat = room.getSeatBySocket(socket.id);
        if (!seat) return callback({ success: false, error: 'Not seated' });

        const result = room.game.handleBid(seat, action, amount);
        if (!result.success) return callback(result);
        callback({ success: true });
        io.to(room.id).emit('game:biddingUpdate', result.state);

        if (result.completed) {
          setTimeout(() => {
            const hukumState = room.game.startHukumSelect();
            io.to(room.id).emit('game:hukumSelect', hukumState);
          }, 1500);
        }
      } catch (err) { callback({ success: false, error: err.message }); }
    });

    // GAME: Hukum Selection
    socket.on('game:selectHukum', (suit, callback) => {
      try {
        const room = roomManager.getRoom(socket.roomId);
        if (!room || !room.game) return callback({ success: false, error: 'No active game' });
        const seat = room.getSeatBySocket(socket.id);
        if (!seat) return callback({ success: false, error: 'Not seated' });

        const result = room.game.selectHukum(seat, suit);
        if (!result.success) return callback(result);
        callback({ success: true });
        io.to(room.id).emit('game:hukumSelected', { hukumSuit: suit });
        io.to(room.id).emit('game:partnerSelect', { bidWinner: room.game.bidWinner });
      } catch (err) { callback({ success: false, error: err.message }); }
    });

    // GAME: Partner Card Selection
    socket.on('game:selectPartner', (cardId, callback) => {
      try {
        const room = roomManager.getRoom(socket.roomId);
        if (!room || !room.game) return callback({ success: false, error: 'No active game' });
        const seat = room.getSeatBySocket(socket.id);
        if (!seat) return callback({ success: false, error: 'Not seated' });

        const result = room.game.selectPartner(seat, cardId);
        if (!result.success) return callback(result);
        callback({ success: true });
        io.to(room.id).emit('game:partnerSelected', { cardId });

        setTimeout(() => {
          const trickState = room.game.startTrickPlay();
          broadcastGameState(room);
          io.to(room.id).emit('game:trickPlayStart', {
            firstPlayer: trickState.currentTurn,
            trumpSuit: room.game.hukumSuit
          });
        }, 1000);
      } catch (err) { callback({ success: false, error: err.message }); }
    });

    // GAME: Play Card
    socket.on('game:playCard', (cardId, callback) => {
      try {
        const room = roomManager.getRoom(socket.roomId);
        if (!room || !room.game) return callback({ success: false, error: 'No active game' });
        const seat = room.getSeatBySocket(socket.id);
        if (!seat) return callback({ success: false, error: 'Not seated' });

        const result = room.game.handleCardPlay(seat, cardId);
        if (!result.success) return callback(result);
        callback({ success: true });

        io.to(room.id).emit('game:cardPlayed', {
          seat, cardId,
          card: result.playedCard 
        });

        if (result.trickComplete) {
          setTimeout(() => {
            io.to(room.id).emit('game:trickComplete', {
              winner: result.trickResult.winningSeat,
              points: result.trickResult.points,
              partnerRevealed: room.game.trickPlay.partnerRevealed,
              partnerSeat: room.game.trickPlay.partnerRevealed ? room.game.trickPlay.partnerSeat : null,
              partnerCard: room.game.trickPlay.partnerRevealed ? room.game.partnerCard : null,
              targetScore: result.targetScore,
              lastTrickAdjustment: result.lastTrickAdjustment,
              partnerKilledInThisTrick: result.partnerKilledInThisTrick,
              partnerRevealedInThisTrick: result.partnerRevealedInThisTrick
            });
            if (result.roundComplete) {
              setTimeout(() => endRound(room, result.roundResult), 2000);
            } else {
              setTimeout(() => broadcastGameState(room), 1500);
            }
          }, 1000);
        } else {
          broadcastGameState(room);
        }
      } catch (err) { callback({ success: false, error: err.message }); }
    });

    // GAME: Force Reveal Partner
    socket.on('game:forceRevealPartner', (callback) => {
      try {
        const room = roomManager.getRoom(socket.roomId);
        if (!room || !room.game) return callback({ success: false, error: 'No active game' });
        const seat = room.getSeatBySocket(socket.id);
        if (!seat) return callback({ success: false, error: 'Not seated' });

        const result = room.game.forceRevealPartner(seat);
        if (!result.success) return callback(result);

        callback({ success: true });
        broadcastGameState(room);
        io.to(room.id).emit('game:partnerForceRevealed', { calledOut: true, seat: room.game.trickPlay.partnerSeat });
      } catch (err) { callback({ success: false, error: err.message }); }
    });

    // GAME: Declare Marriage
    socket.on('game:declareMarriage', (suit, callback) => {
      try {
        const room = roomManager.getRoom(socket.roomId);
        if (!room || !room.game) return callback({ success: false, error: 'No active game' });
        const seat = room.getSeatBySocket(socket.id);
        if (!seat) return callback({ success: false, error: 'Not seated' });

        const result = room.game.handleDeclareMarriage(seat, suit);
        if (!result.success) return callback(result);

        callback({ success: true });
        broadcastGameState(room);
        io.to(room.id).emit('game:marriageDeclared', { 
          seat: seat, 
          suit: suit, 
          targetScore: result.targetScore, 
          targetAdj: result.targetAdj 
        });
      } catch (err) { callback({ success: false, error: err.message }); }
    });

    // GAME: Request state (reconnection)
    socket.on('game:requestState', (callback) => {
      try {
        const room = roomManager.getRoom(socket.roomId);
        if (!room || !room.game) return callback({ success: false });
        const seat = room.getSeatBySocket(socket.id);
        if (!seat) return callback({ success: false });
        callback({ success: true, state: room.game.getStateForPlayer(seat), room: room.getPublicState() });
      } catch (err) { callback({ success: false, error: err.message }); }
    });

    // GAME: Next Round (Wait for all)
    socket.on('game:nextRound', (callback) => {
      try {
        const room = roomManager.getRoom(socket.roomId);
        if (!room || !room.game) return callback({ success: false });
        if (room.game.phase !== PHASES.ROUND_END) return callback({ success: false, error: 'Round not ended yet' });

        if (!room.readyPlayersForNextRound) {
           room.readyPlayersForNextRound = new Set();
        }
        
        const seat = room.getSeatBySocket(socket.id);
        if (seat) room.readyPlayersForNextRound.add(seat);
        
        io.to(room.id).emit('game:roundReadyState', { readyCount: room.readyPlayersForNextRound.size });
        
        if (room.readyPlayersForNextRound.size === 4) {
           room.readyPlayersForNextRound.clear();
           startNewRound(room);
        }
        callback({ success: true });
      } catch (err) { callback({ success: false, error: err.message }); }
    });

    // Chat
    socket.on('chat:message', (message) => {
      if (!socket.roomId) return;
      io.to(socket.roomId).emit('chat:message', {
        from: socket.user.displayName,
        message: message.substring(0, 200),
        timestamp: Date.now()
      });
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`Player disconnected: ${socket.user.displayName} (${socket.id})`);
      if (socket.roomId) {
        const room = roomManager.getRoom(socket.roomId);
        if (room) {
          const disconnected = room.handleDisconnect(socket.id);
          if (disconnected) {
            io.to(room.id).emit('room:playerDisconnected', {
              seat: disconnected.seat, displayName: disconnected.player.displayName
            });
            io.to(room.id).emit('room:update', room.getPublicState());
            if (disconnected.player.userId === room.hostId) {
              const newHost = room.transferHost();
              if (newHost) io.to(room.id).emit('room:hostChanged', { newHostName: newHost.displayName });
            }
            setTimeout(() => {
              if (room.isEmpty()) { roomManager.deleteRoom(room.id); console.log(`Room ${room.id} deleted (empty)`); }
            }, 5 * 60 * 1000);
          }
        }
      }
    });
  });

  // ============================================================
  // Helper Functions
  // ============================================================
  function startGame(room) {
    room.gameStarted = true;
    room.game = new GameEngine(room);
    console.log(`Game started in room ${room.id}`);
    io.to(room.id).emit('game:started', { roomId: room.id, seats: room.getPublicState().seats });
    setTimeout(() => startNewRound(room), 1500);
  }

  function startNewRound(room) {
    const dealResult = room.game.startRound();
    io.to(room.id).emit('game:dealing', { phase: 'first', dealerSeat: dealResult.dealerSeat, roundNumber: dealResult.roundNumber });
    setTimeout(() => {
      for (let s = 1; s <= 4; s++) {
        const ps = getSocketByUserId(room, s);
        if (ps) ps.emit('game:cardsDealt', { phase: 'first', hand: room.game.hands[s] });
      }
      setTimeout(() => {
        const vakhaiState = room.game.startVakhai();
        io.to(room.id).emit('game:vakhaiStart', vakhaiState);
      }, 1500);
    }, 2000);
  }

  function endRound(room, roundResult) {
    io.to(room.id).emit('game:roundEnd', { roundResult, scoring: room.game.scoring.getState() });
    try {
      const players = {};
      for (let s = 1; s <= 4; s++) {
        if (room.seats[s]) players[s] = { userId: room.seats[s].userId, displayName: room.seats[s].displayName };
      }
      gameHistoryModel.saveRound(room.id, {
        roundNumber: room.game.roundNumber, players,
        bidWinnerId: room.seats[room.game.bidWinner]?.userId,
        bidAmount: room.game.bidAmount, hukumSuit: room.game.hukumSuit,
        partnerCard: room.game.partnerCard, scores: roundResult.roundMarks,
        winnerTeam: roundResult.bidSuccess ? 'bidder' : 'opponent'
      });
      for (let s = 1; s <= 4; s++) {
        if (room.seats[s]) {
          statsModel.updateStats(room.seats[s].userId, {
            marks: roundResult.roundMarks[s],
            wasBidder: s === room.game.bidWinner,
            bidSuccess: roundResult.bidSuccess && s === room.game.bidWinner,
            gameEnded: false
          });
        }
      }
      saveDatabase();
    } catch (err) { console.error('Error saving round to DB:', err); }
  }

  function getSocketByUserId(room, seatNumber) {
    const player = room.seats[seatNumber];
    if (!player || !player.socketId) return null;
    return io.sockets.sockets.get(player.socketId);
  }

  function broadcastGameState(room) {
    for (let s = 1; s <= 4; s++) {
      const ps = getSocketByUserId(room, s);
      if (ps) ps.emit('game:state', room.game.getStateForPlayer(s));
    }
  }

  // Periodic cleanup
  setInterval(() => roomManager.cleanupEmptyRooms(), 60000);

  // ============================================================
  // Start Server
  // ============================================================
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`\n🃏 304 Card Game Server running on http://localhost:${PORT}\n`);
  });
}

// Run the server
boot().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});


