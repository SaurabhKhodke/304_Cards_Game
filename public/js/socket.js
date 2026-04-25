// ============================================================
// Socket.IO Client Wrapper – robust reconnect + hydration
// ============================================================

const SocketClient = {
  socket: null,
  token: null,
  roomId: null,   // persisted across reconnects

  connect(token) {
    this.token = token;

    // Tear down old socket cleanly
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.socket = io({
      auth: { token },
      query: { token },
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 12000,
      timeout: 20000,
      transports: ['websocket', 'polling']
    });

    // Refresh token header on every reconnect attempt
    this.socket.io.on('reconnect_attempt', () => {
      const t = localStorage.getItem('304_token');
      if (t) {
        this.socket.auth = { token: t };
        this.socket.io.opts.query = { token: t };
      }
    });

    this.socket.on('connect', () => {
      console.log('[Socket] Connected', this.socket.id);
      const bar = document.getElementById('connection-bar');
      if (bar) bar.classList.add('hidden');

      // Rejoin room if we had one
      const roomId = this.roomId || this.socket.roomId;
      if (roomId) {
        this.socket.roomId = roomId;
        this.emit('room:join', roomId, (res) => {
          if (!res || !res.success) return;
          // If game is in progress, hydrate client
          if (res.gameStarted && res.gameState) {
            const seat = res.seat;
            if (typeof LobbyUI !== 'undefined') LobbyUI.mySeat = seat;
            if (typeof GameUI !== 'undefined') {
              GameUI.mySeat = seat;
              App.showScreen('game');
              GameUI.handleFullState(res.gameState, res.room);
            }
          } else if (res.reconnected) {
            if (typeof LobbyUI !== 'undefined') {
              LobbyUI.mySeat = res.seat;
              LobbyUI.updateRoomDisplay(res.room);
              if (res.room && res.room.gameStarted) App.showScreen('game');
            }
          }
        });
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      const bar = document.getElementById('connection-bar');
      if (bar) {
        bar.classList.remove('hidden', 'connected');
        const txt = document.getElementById('connection-text');
        if (txt) txt.textContent = '⚡ Reconnecting...';
      }
    });

    this.socket.on('connect_error', (err) => {
      console.error('[Socket] connect_error:', err.message);
      if (err.message === 'Authentication required' ||
          err.message === 'Invalid token' ||
          err.message === 'User not found') {
        if (typeof AuthUI !== 'undefined') AuthUI.logout();
      }
    });

    // Hydration event: server sends full game state to reconnecting player
    this.socket.on('game:hydrate', (payload) => {
      console.log('[Socket] game:hydrate received, phase:', payload.phase);
      if (typeof GameUI === 'undefined') return;

      const seat = payload.seat;
      if (seat) {
        GameUI.mySeat = seat;
        if (typeof LobbyUI !== 'undefined') LobbyUI.mySeat = seat;
      }

      // Switch to game screen if not already there
      if (typeof App !== 'undefined' && App.currentScreen !== 'game') {
        App.showScreen('game');
      }

      // Update room state (player names etc.)
      if (payload.roomState) {
        GameUI.roomState = payload.roomState;
        GameUI.updatePlayerNames(payload.roomState.seats);
      }

      // Apply full game state
      if (payload.gameState) {
        GameUI.handleFullState(payload.gameState, payload.roomState);
      }

      // Show hukum indicator if already selected
      if (payload.hukumSuit) {
        GameUI.showHukumIndicator(payload.hukumSuit);
        if (GameUI.gameState) GameUI.gameState.hukumSuit = payload.hukumSuit;
      }

      // Show partner indicator if already selected
      if (payload.partnerCard) {
        GameUI.showPartnerIndicator(payload.partnerCard);
        if (GameUI.gameState) GameUI.gameState.partnerCard = payload.partnerCard;
      }

      // Update target score display
      if (payload.targetScore) {
        const tEl = document.getElementById('game-target-score');
        if (tEl) tEl.textContent = payload.targetScore;
      }
    });

    return this.socket;
  },

  emit(event, data, callback) {
    if (!this.socket || !this.socket.connected) {
      console.warn('[Socket] emit called but not connected:', event);
      return;
    }
    if (data !== null && data !== undefined) {
      this.socket.emit(event, data, callback);
    } else {
      this.socket.emit(event, callback);
    }
  },

  on(event, handler) {
    if (!this.socket) return;
    this.socket.on(event, handler);
  },

  off(event) {
    if (!this.socket) return;
    this.socket.off(event);
  },

  /** Request a full game state resync from server */
  requestSync() {
    if (!this.socket || !this.socket.connected) return;
    this.socket.emit('game:syncState', (res) => {
      if (!res || !res.success) console.warn('[Socket] syncState failed');
    });
  },

  disconnect() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.roomId = null;
  }
};

window.SocketClient = SocketClient;
