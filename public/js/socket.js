// ============================================================
// Socket.IO Client Wrapper
// ============================================================

const SocketClient = {
  socket: null,
  token: null,

  /**
   * Connect to the server with auth token
   */
  connect(token) {
    this.token = token;
    this.socket = io({
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    this.socket.on('connect', () => {
      console.log('Connected to server');
      document.getElementById('connection-bar').classList.add('hidden');
      // If we were in a room, request state
      if (this.socket.roomId) {
        this.emit('game:requestState', null, (res) => {
          if (res.success) {
            GameUI.handleFullState(res.state, res.room);
          }
        });
      }
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected');
      const bar = document.getElementById('connection-bar');
      bar.classList.remove('hidden', 'connected');
      document.getElementById('connection-text').textContent = 'Reconnecting...';
    });

    this.socket.on('connect_error', (err) => {
      console.error('Connection error:', err.message);
      if (err.message === 'Authentication required' || err.message === 'Invalid token') {
        AuthUI.logout();
      }
    });

    return this.socket;
  },

  /**
   * Emit event with callback
   */
  emit(event, data, callback) {
    if (!this.socket) return;
    if (data !== null && data !== undefined) {
      this.socket.emit(event, data, callback);
    } else {
      this.socket.emit(event, callback);
    }
  },

  /**
   * Listen for event
   */
  on(event, handler) {
    if (!this.socket) return;
    this.socket.on(event, handler);
  },

  /**
   * Remove listener
   */
  off(event) {
    if (!this.socket) return;
    this.socket.off(event);
  },

  /**
   * Disconnect
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
};

window.SocketClient = SocketClient;
