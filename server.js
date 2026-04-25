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

  // ── API routes FIRST — before static or any fallback ──
  app.use('/api/auth', authRouter);

  // ── Static files ──
  app.use(express.static(path.join(__dirname, 'public')));

  // ── Catch-all: API misses → JSON 404, everything else → SPA ──
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'API route not found' });
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // ============================================================
  // Socket.IO Setup
  // ============================================================
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization']
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling']
  });

  // Authenticate socket connections
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token ||
        socket.handshake.query?.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }
      const user = userModel.verifyToken(token);
      if (!user) {
        return next(new Error('Invalid token'));
      }
      // Always refetch latest user state (e.g. if profile edits happened)
      const latestUser = userModel.getUserById(user.id);
      if (!latestUser) {
        return next(new Error('User not found'));
      }
      socket.user = latestUser;
      next();
    } catch (err) {
      next(new Error('Auth error: ' + err.message));
    }
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
      if (typeof callback !== 'function') return;
      try {
        if (!roomId || typeof roomId !== 'string') {
          return callback({ success: false, error: 'Invalid room ID' });
        }
        const room = roomManager.getRoom(roomId.trim().toUpperCase());
        if (!room) return callback({ success: false, error: 'Room not found' });

        // Already joined with this socket — send fresh state
        if (socket.roomId === room.id) {
          const seat = room.getSeatBySocket(socket.id);
          const resp = { success: true, room: room.getPublicState(), reconnected: !!seat, seat };
          if (room.game && seat) {
            resp.gameStarted = true;
            resp.gamePhase = room.game.phase;
            resp.gameState = room.game.getStateForPlayer(seat);
          }
          return callback(resp);
        }

        // Reconnecting player (same userId, new socket)
        const reconnectedSeat = room.handleReconnect(socket.user.id, socket.id);
        if (reconnectedSeat) {
          socket.join(room.id);
          socket.roomId = room.id;
          io.to(room.id).emit('room:update', room.getPublicState());
          const resp = { success: true, room: room.getPublicState(), reconnected: true, seat: reconnectedSeat };
          if (room.game) {
            resp.gameStarted = true;
            resp.gamePhase = room.game.phase;
            resp.gameState = room.game.getStateForPlayer(reconnectedSeat);
            // Re-send current phase events so the client can reconstruct UI
            socket.emit('game:hydrate', buildHydratePayload(room, reconnectedSeat));
          }
          return callback(resp);
        }

        if (room.isFull()) return callback({ success: false, error: 'Room is full' });
        if (room.gameStarted) return callback({ success: false, error: 'Game already in progress' });
        socket.join(room.id);
        socket.roomId = room.id;
        callback({ success: true, room: room.getPublicState() });
        io.to(room.id).emit('room:update', room.getPublicState());
      } catch (err) { callback({ success: false, error: err.message }); }
    });

    // GAME: Full state resync (client can call anytime to recover)
    socket.on('game:syncState', (callback) => {
      try {
        const room = roomManager.getRoom(socket.roomId);
        if (!room || !room.game) {
          return typeof callback === 'function' ? callback({ success: false }) : null;
        }
        const seat = room.getSeatBySocket(socket.id) || room.getSeatByUser(socket.user.id);
        if (!seat) return typeof callback === 'function' ? callback({ success: false }) : null;
        socket.emit('game:hydrate', buildHydratePayload(room, seat));
        if (typeof callback === 'function') callback({ success: true });
      } catch (err) {
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
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

    // ============================================================
    // GAME: Vakhai Declaration
    // ============================================================
    socket.on('game:vakhai', ({ action, stake }, callback) => {
      try {
        const room = roomManager.getRoom(socket.roomId);
        if (!room || !room.game) return callback({ success: false, error: 'No active game' });

        // Block if round already terminated
        if (room.game.roundTerminated) return callback({ success: false, error: 'Round has ended' });

        const seat = room.getSeatBySocket(socket.id);
        if (!seat) return callback({ success: false, error: 'Not seated' });

        // FIRST check turn
        if (room.game.vakhai?.currentTurn !== seat) {
          return callback({ success: true });
        }

        // THEN check phase
        if (room.game.phase !== 'VAKHAI') {
          return callback({ success: true });
        }

        // Per-seat dedup: reject duplicate actions (button spam / network retry)
        if (!room.vakhaiActed) room.vakhaiActed = new Set();
        if (room.vakhaiActed.has(seat)) {
          return callback({ success: true, ignored: true });
        }

        const result = room.game.handleVakhaiAction(seat, action, stake);
        if (!result.success) {
          if (result.error === 'Not in declaring phase') return callback({ success: true });
          return callback(result);
        }

        // Mark this seat as having acted so duplicate events are dropped
        room.vakhaiActed.add(seat);
        callback({ success: true });

        // Broadcast updated vakhai state to all players
        io.to(room.id).emit('game:vakhaiUpdate', result.state);
        broadcastGameState(room);

        if (result.noDeclarer) {
          // ── Nobody declared Vakhai → proceed with normal game flow ──
          const t1 = scheduleTimer(room, 2000, () => {
            if (room.game.roundTerminated) return;
            room.game.dealSecondHand();
            for (let s = 1; s <= 4; s++) {
              const ps = getSocketByUserId(room, s);
              if (ps && ps.connected) {
                ps.emit('game:cardsDealt', { phase: 'second', hand: room.game.hands[s] });
              }
            }
            const t2 = scheduleTimer(room, 1800, () => {
              if (room.game.roundTerminated) return;
              const biddingState = room.game.startBidding();
              io.to(room.id).emit('game:biddingStart', biddingState);
              broadcastGameState(room);
            });
          });
        } else if (result.vakhaiActive) {
          // ── A player declared Vakhai → freeze; wait for trick plays ──
          const declarerName = room.seats[result.state.vakhaiDeclarer]?.displayName
            || `Seat ${result.state.vakhaiDeclarer}`;
          io.to(room.id).emit('game:vakhaiTrickStart', {
            vakhaiDeclarer: result.state.vakhaiDeclarer,
            vakhaiStake: result.state.vakhaiStake,
            declarerName
          });
          broadcastGameState(room);
        }
        // else: still collecting declarations — nothing extra to do
      } catch (err) { callback({ success: false, error: err.message }); }
    });

    // ============================================================
    // GAME: Bidding
    // ============================================================
    socket.on('game:bid', ({ action, amount }, callback) => {
      try {
        const room = roomManager.getRoom(socket.roomId);
        if (!room || !room.game) return callback({ success: false, error: 'No active game' });
        if (room.game.roundTerminated) return callback({ success: false, error: 'Round has ended' });
        const seat = room.getSeatBySocket(socket.id);
        if (!seat) return callback({ success: false, error: 'Not seated' });

        const result = room.game.handleBid(seat, action, amount);
        if (!result.success) return callback(result);
        callback({ success: true });
        io.to(room.id).emit('game:biddingUpdate', result.state);
        broadcastGameState(room);

        if (result.completed) {
          scheduleTimer(room, 1500, () => {
            if (room.game.roundTerminated) return;
            const hukumState = room.game.startHukumSelect();
            io.to(room.id).emit('game:hukumSelect', hukumState);
            broadcastGameState(room);
          });
        }
      } catch (err) { callback({ success: false, error: err.message }); }
    });

    // ============================================================
    // GAME: Hukum Selection
    // ============================================================
    socket.on('game:selectHukum', (suit, callback) => {
      try {
        const room = roomManager.getRoom(socket.roomId);
        if (!room || !room.game) return callback({ success: false, error: 'No active game' });
        if (room.game.roundTerminated) return callback({ success: false, error: 'Round has ended' });
        const seat = room.getSeatBySocket(socket.id);
        if (!seat) return callback({ success: false, error: 'Not seated' });

        const result = room.game.selectHukum(seat, suit);
        if (!result.success) return callback(result);
        callback({ success: true });
        io.to(room.id).emit('game:hukumSelected', { hukumSuit: suit });
        io.to(room.id).emit('game:partnerSelect', { bidWinner: room.game.bidWinner });
        broadcastGameState(room);
      } catch (err) { callback({ success: false, error: err.message }); }
    });

    // ============================================================
    // GAME: Partner Card Selection
    // ============================================================
    socket.on('game:selectPartner', (cardId, callback) => {
      try {
        const room = roomManager.getRoom(socket.roomId);
        if (!room || !room.game) return callback({ success: false, error: 'No active game' });
        if (room.game.roundTerminated) return callback({ success: false, error: 'Round has ended' });
        const seat = room.getSeatBySocket(socket.id);
        if (!seat) return callback({ success: false, error: 'Not seated' });

        const result = room.game.selectPartner(seat, cardId);
        if (!result.success) return callback(result);
        callback({ success: true });
        io.to(room.id).emit('game:partnerSelected', { cardId });
        broadcastGameState(room);

        scheduleTimer(room, 1000, () => {
          if (room.game.roundTerminated) return;
          const trickState = room.game.startTrickPlay();
          broadcastGameState(room);
          io.to(room.id).emit('game:trickPlayStart', {
            firstPlayer: trickState.currentTurn,
            trumpSuit: room.game.hukumSuit
          });
        });
      } catch (err) { callback({ success: false, error: err.message }); }
    });

    // ============================================================
    // GAME: Play Card (handles both normal trick-play AND vakhai tricks)
    // ============================================================
    socket.on('game:playCard', (cardId, callback) => {
      try {
        const room = roomManager.getRoom(socket.roomId);
        if (!room || !room.game) return callback({ success: false, error: 'No active game' });
        if (room.game.roundTerminated) return callback({ success: false, error: 'Round has ended' });
        const seat = room.getSeatBySocket(socket.id);
        if (!seat) return callback({ success: false, error: 'Not seated' });

        // ── Route: Vakhai card play vs normal trick play ──
        const isVakhaiPlaying = room.game.phase === 'VAKHAI'
          && room.game.vakhai?.state === 'PLAYING';

        let result;
        if (isVakhaiPlaying) {
          result = room.game.handleVakhaiCardPlay(seat, cardId);
        } else {
          result = room.game.handleCardPlay(seat, cardId);
        }

        if (!result.success) return callback(result);
        callback({ success: true });

        io.to(room.id).emit('game:cardPlayed', {
          seat, cardId,
          card: result.playedCard
        });

        // ── Vakhai round ended (win OR loss) ──
        if (result.vakhaiRoundComplete) {
          // Terminate so nothing else can proceed
          terminateRound(room);

          scheduleTimer(room, 1000, () => {
            // Show trick winner banner
            io.to(room.id).emit('game:trickComplete', {
              winner: result.trickResult.winningSeat,
              trickNumber: result.trickResult.trickNumber || 0,
              points: 0,
              vakhaiDefeated: result.vakhaiDefeated || false
            });
          });

          // Emit vakhai results to show outcome animation
          if (result.vakhaiResults && result.vakhaiResults.length > 0) {
            scheduleTimer(room, 1500, () => {
              io.to(room.id).emit('game:vakhaiResults', result.vakhaiResults);
            });
          }

          // End the round after a short delay for animations
          scheduleTimer(room, 3500, () => {
            const roundResult = {
              isVakhaiRound: true,
              vakhaiDeclarer: result.vakhaiDeclarer,
              vakhaiStake: result.vakhaiStake,
              vakhaiDefeated: result.vakhaiDefeated,
              roundMarks: result.roundMarks,
              totalMarks: result.scoring.totalMarks,
              bidAmount: result.vakhaiStake,
              finalTarget: result.vakhaiStake,
              bidderSeat: result.vakhaiDeclarer,
            };
            endVakhaiRound(room, roundResult);
          });
          return;
        }

        // ── Normal trick-play logic ──
        if (result.trickComplete) {
          scheduleTimer(room, 1000, () => {
            if (room.game.roundTerminated && !result.roundComplete) return;

            io.to(room.id).emit('game:trickComplete', {
              winner: result.trickResult.winningSeat,
              trickNumber: result.trickResult.trickNumber || 0,
              points: result.trickResult.points || 0,
              partnerRevealed: room.game.trickPlay ? room.game.trickPlay.partnerRevealed : false,
              partnerSeat: (room.game.trickPlay && room.game.trickPlay.partnerRevealed)
                ? room.game.trickPlay.partnerSeat : null,
              partnerCard: (room.game.trickPlay && room.game.trickPlay.partnerRevealed)
                ? room.game.partnerCard : null,
              targetScore: result.targetScore,
              lastTrickAdjustment: result.lastTrickAdjustment,
              partnerKilledInThisTrick: result.partnerKilledInThisTrick,
              partnerRevealedInThisTrick: result.partnerRevealedInThisTrick,
              vakhaiDefeated: false
            });

            if (result.roundComplete) {
              scheduleTimer(room, 2000, () => endRound(room, result.roundResult));
            } else {
              scheduleTimer(room, 1500, () => {
                if (room.game.roundTerminated) return;
                broadcastGameState(room);
              });
            }
          });
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

    // GAME: Next Round (Wait for all 4 players)
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
    // Emit game:started first so all clients switch to game screen
    io.to(room.id).emit('game:started', { roomId: room.id, seats: room.getPublicState().seats });
    // Immediately start the round — no setTimeout so no race window
    startNewRound(room);
  }

  /**
   * Start a completely fresh new round.
   * Clears all timers, resets roundTerminated, deals 4 cards, starts Vakhai phase.
   */
  function startNewRound(room) {
    // Cancel any lingering timers from the previous round
    clearAllTimers(room);

    // Reset per-round Vakhai dedup tracker
    room.vakhaiActed = new Set();

    const dealResult = room.game.startRound();
    io.to(room.id).emit('game:dealing', {
      phase: 'first',
      dealerSeat: dealResult.dealerSeat,
      roundNumber: dealResult.roundNumber
    });

    // Deal cards after shuffle animation (2000ms) then start Vakhai
    scheduleTimer(room, 2000, () => {
      for (let s = 1; s <= 4; s++) {
        const ps = getSocketByUserId(room, s);
        if (ps && ps.connected) {
          ps.emit('game:cardsDealt', { phase: 'first', hand: room.game.hands[s] });
        }
      }
      scheduleTimer(room, 1200, () => {
        const vakhaiState = room.game.startVakhai();
        io.to(room.id).emit('game:vakhaiStart', vakhaiState);
        broadcastGameState(room);
      });
    });
  }

  // ------------------------------------------------------------------
  // Timer Management
  // ------------------------------------------------------------------

  /**
   * Schedule a timer that is tracked by the room so it can be cancelled
   * when the round terminates (Vakhai win/loss).
   */
  function scheduleTimer(room, delayMs, fn) {
    if (!room.pendingTimers) room.pendingTimers = [];
    const id = setTimeout(() => {
      // Remove self from the list when it fires
      if (room.pendingTimers) {
        const idx = room.pendingTimers.indexOf(id);
        if (idx !== -1) room.pendingTimers.splice(idx, 1);
      }
      fn();
    }, delayMs);
    room.pendingTimers.push(id);
    return id;
  }

  /**
   * Cancel ALL pending timers for a room.
   * Called on Vakhai termination and on every round start.
   */
  function clearAllTimers(room) {
    if (room.pendingTimers && room.pendingTimers.length > 0) {
      room.pendingTimers.forEach(id => clearTimeout(id));
      room.pendingTimers = [];
    }
  }

  /**
   * Mark the current round as terminated.
   * Sets the flag in the game engine AND cancels all pending timers.
   * After this point, NO async action can continue the round.
   */
  function terminateRound(room) {
    if (room.game) {
      room.game.roundTerminated = true;
    }
    clearAllTimers(room);
    console.log(`[Room ${room.id}] Round terminated (Vakhai ended).`);
  }

  // ------------------------------------------------------------------
  // Round End Helpers
  // ------------------------------------------------------------------

  /** Build a full hydration payload for a reconnecting player */
  function buildHydratePayload(room, seat) {
    const game = room.game;
    const payload = {
      roomState: room.getPublicState(),
      gameState: game.getStateForPlayer(seat),
      seat,
      phase: game.phase,
    };
    if (game.hukumSuit) payload.hukumSuit = game.hukumSuit;
    if (game.partnerCard) payload.partnerCard = game.partnerCard;
    if (game.bidWinner) payload.bidWinner = game.bidWinner;
    if (game.bidAmount) payload.bidAmount = game.bidAmount;
    if (game.targetScore) payload.targetScore = game.targetScore;
    if (game.bidding) payload.biddingState = game.bidding.getState();
    if (game.trickPlay) payload.trickState = game.trickPlay.getState(seat);
    return payload;
  }

  /**
   * End a Vakhai-only round (no bidding was played).
   * Emits game:roundEnd with vakhai-safe fields, persists stats, sets ROUND_END phase.
   */
  function endVakhaiRound(room, vakhaiRoundResult) {
    // Ensure terminated so nothing else can sneak through
    if (room.game) room.game.roundTerminated = true;
    room.game.phase = PHASES.ROUND_END;

    // Patch result fields so the client onRoundEnd renders without crashing
    const safeResult = {
      ...vakhaiRoundResult,
      isVakhaiRound: true,
      bidSuccess: false,            // not applicable
      bidderSeat: vakhaiRoundResult.vakhaiDeclarer,
      bidAmount: vakhaiRoundResult.vakhaiStake,
      finalTarget: vakhaiRoundResult.vakhaiStake,
      bidderTeamPoints: 0,
      opponentTeamPoints: 0,
    };

    io.to(room.id).emit('game:roundEnd', {
      roundResult: safeResult,
      scoring: room.game.scoring.getState()
    });

    console.log(`[Room ${room.id}] Vakhai round ended. Defeated: ${vakhaiRoundResult.vakhaiDefeated}`);

    // Persist stats (minimal — no full bid history for vakhai)
    try {
      const marks = vakhaiRoundResult.roundMarks || { 1: 0, 2: 0, 3: 0, 4: 0 };
      for (let s = 1; s <= 4; s++) {
        if (room.seats[s]) {
          statsModel.updateStats(room.seats[s].userId, {
            marks: marks[s] || 0,
            wasBidder: false,
            bidSuccess: false,
            gameEnded: false
          });
        }
      }
      saveDatabase();
    } catch (err) { console.error('Error saving vakhai round to DB:', err); }
  }

  /**
   * End a normal trick-play round.
   */
  function endRound(room, roundResult) {
    room.game.phase = PHASES.ROUND_END;
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
    if (!room || !room.game) return;
    for (let s = 1; s <= 4; s++) {
      try {
        const ps = getSocketByUserId(room, s);
        if (ps && ps.connected) ps.emit('game:state', room.game.getStateForPlayer(s));
      } catch (e) {
        console.warn(`broadcastGameState: failed for seat ${s}:`, e.message);
      }
    }
  }

  // Periodic cleanup
  setInterval(() => roomManager.cleanupEmptyRooms(), 60000);

  // ============================================================
  // Start Server
  // ============================================================
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`🃏 Server running on port ${PORT}`);
  });
}

// Run the server
boot().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
