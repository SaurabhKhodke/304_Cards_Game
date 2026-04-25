// ============================================================
// Lobby UI - Room creation, joining, seat selection
// ============================================================

const LobbyUI = {
  currentRoomId: null,
  mySeat: null,

  init() {
    // Create room
    document.getElementById('btn-create-room').addEventListener('click', () => this.createRoom());

    // Join room
    document.getElementById('btn-join-room').addEventListener('click', () => this.joinRoom());
    document.getElementById('input-room-code').addEventListener('keyup', (e) => {
      if (e.key === 'Enter') this.joinRoom();
    });

    // Copy room code
    document.getElementById('btn-copy-code').addEventListener('click', () => this.copyRoomCode());

    // Seat selection
    document.querySelectorAll('.seat-slot').forEach(slot => {
      slot.addEventListener('click', () => {
        const seat = parseInt(slot.dataset.seat);
        this.takeSeat(seat);
      });
    });

    // Logout
    document.getElementById('btn-logout').addEventListener('click', () => AuthUI.logout());

    // Stats
    document.getElementById('btn-stats').addEventListener('click', () => this.showStats());
    document.getElementById('btn-leaderboard').addEventListener('click', () => this.showLeaderboard());

    // Profile/Settings
    const btnProfile = document.getElementById('btn-profile');
    if (btnProfile) btnProfile.addEventListener('click', () => this.showProfileSettings());
    const btnSaveProfile = document.getElementById('btn-save-profile');
    if (btnSaveProfile) btnSaveProfile.addEventListener('click', () => this.saveProfile());

    // Profile photo upload trigger
    const profileUpload = document.getElementById('profile-pic-upload');
    if (profileUpload) {
      profileUpload.addEventListener('change', (e) => this.handleProfilePicSelect(e));
    }

    // Modal close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.dataset.close;
        document.getElementById(modalId).classList.add('hidden');
      });
    });

    // Socket events
    this.setupSocketEvents();
  },

  setupSocketEvents() {
    SocketClient.on('room:update', (roomState) => {
      this.updateRoomDisplay(roomState);
      if (window.GameUI) GameUI.roomState = roomState;
    });
    SocketClient.on('room:playerDisconnected', (data) => {
      Animations.showToast(`${data.displayName} disconnected`, 'warning');
    });
    SocketClient.on('room:hostChanged', (data) => {
      Animations.showToast(`${data.newHostName} is now the host`, 'info');
    });
    SocketClient.on('game:started', (data) => {
      Animations.showToast('Game starting!', 'success');
      App.showScreen('game');
      GameUI.onGameStarted(data);
    });
    // Handle hydration for reconnected players who missed game:started
    // (game:hydrate is handled directly in socket.js, but we also
    //  ensure LobbyUI.mySeat stays in sync)
    SocketClient.on('game:hydrate', (payload) => {
      if (payload.seat) this.mySeat = payload.seat;
    });
  },

  createRoom() {
    SocketClient.emit('room:create', null, (res) => {
      if (res.success) {
        this.currentRoomId = res.roomId;
        SocketClient.roomId = res.roomId;          // persist for reconnect
        SocketClient.socket.roomId = res.roomId;
        document.getElementById('room-code-display').textContent = res.roomId;
        document.getElementById('room-area').classList.remove('hidden');
        Animations.showToast('Room created!', 'success');
        
        // Automatically take Seat 1
        this.takeSeat(1);
      } else {
        Animations.showToast(res.error, 'error');
      }
    });
  },

  joinRoom() {
    const code = document.getElementById('input-room-code').value.trim().toUpperCase();
    if (!code || code.length < 4) {
      Animations.showToast('Enter a valid room code', 'error');
      return;
    }

    SocketClient.emit('room:join', code, (res) => {
      if (res.success) {
        this.currentRoomId = code;
        SocketClient.roomId = code;               // persist for reconnect
        SocketClient.socket.roomId = code;
        document.getElementById('room-code-display').textContent = code;
        document.getElementById('room-area').classList.remove('hidden');
        this.updateRoomDisplay(res.room);
        
        if (res.reconnected) {
          this.mySeat = res.seat;
          Animations.showToast('Reconnected to room!', 'success');
          if (res.room.gameStarted) {
            App.showScreen('game');
          }
        } else {
          Animations.showToast('Joined room!', 'success');
          // Automatically pick the first empty seat
          if (!res.room.gameStarted) {
            for (let i = 1; i <= 4; i++) {
              if (!res.room.seats[i]) {
                this.takeSeat(i);
                break;
              }
            }
          }
        }
      } else {
        Animations.showToast(res.error, 'error');
      }
    });
  },

  takeSeat(seatNumber) {
    if (this.mySeat === seatNumber) return;
    
    SocketClient.emit('room:takeSeat', seatNumber, (res) => {
      if (res.success) {
        this.mySeat = seatNumber;
        Animations.showToast(`Seated at position ${seatNumber}`, 'success');
      } else {
        Animations.showToast(res.error, 'error');
      }
    });
  },

  updateRoomDisplay(roomState) {
    for (let i = 1; i <= 4; i++) {
      const slot = document.getElementById(`seat-${i}`);
      const player = roomState.seats[i];
      
      slot.classList.remove('taken', 'my-seat', 'disconnected');
      
      if (player) {
        slot.classList.add('taken');
        slot.querySelector('.seat-player').textContent = player.displayName;
        
        if (player.userId == window.currentUser?.id) {
          slot.classList.add('my-seat');
          this.mySeat = i;
        }
        
        if (!player.connected) {
          slot.classList.add('disconnected');
          slot.querySelector('.seat-status').textContent = '⚠ Disconnected';
        } else {
          slot.querySelector('.seat-status').textContent = '✓ Connected';
        }
      } else {
        slot.querySelector('.seat-player').textContent = 'Empty';
        slot.querySelector('.seat-status').textContent = '';
      }
    }

    // Update waiting text
    const seatedCount = Object.values(roomState.seats).filter(s => s !== null).length;
    const waitingText = document.getElementById('waiting-text');
    if (seatedCount === 4) {
      waitingText.textContent = 'All players ready! Starting game...';
    } else {
      waitingText.textContent = `${seatedCount}/4 players seated. Waiting...`;
    }
  },

  copyRoomCode() {
    const code = this.currentRoomId;
    if (!code) return;
    
    if (navigator.share) {
      navigator.share({
        title: '304 Card Game',
        text: `Join my 304 game! Room code: ${code}`,
        url: window.location.href
      }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(code).then(() => {
        Animations.showToast('Room code copied!', 'success');
      });
    }
  },

  async showStats() {
    const modal = document.getElementById('modal-stats');
    const content = document.getElementById('stats-content');
    
    try {
      const res = await fetch('/api/auth/stats/me', {
        headers: { 'Authorization': `Bearer ${window.authToken}` }
      });
      const stats = await res.json();
      
      content.innerHTML = `
        <div class="stat-item"><div class="stat-value">${stats.total_marks || 0}</div><div class="stat-label">Total Marks</div></div>
        <div class="stat-item"><div class="stat-value">${stats.games_played || 0}</div><div class="stat-label">Games Played</div></div>
        <div class="stat-item"><div class="stat-value">${stats.games_won || 0}</div><div class="stat-label">Games Won</div></div>
        <div class="stat-item"><div class="stat-value">${stats.rounds_played || 0}</div><div class="stat-label">Rounds</div></div>
        <div class="stat-item"><div class="stat-value">${stats.bids_won || 0}</div><div class="stat-label">Bids Won</div></div>
        <div class="stat-item"><div class="stat-value">${stats.bids_failed || 0}</div><div class="stat-label">Bids Lost</div></div>
        <div class="stat-item"><div class="stat-value">${stats.vakhai_won || 0}</div><div class="stat-label">Vakhai Won</div></div>
        <div class="stat-item"><div class="stat-value">${stats.vakhai_lost || 0}</div><div class="stat-label">Vakhai Lost</div></div>
      `;
    } catch (e) {
      content.innerHTML = '<p style="color:var(--text-muted)">Could not load stats</p>';
    }
    
    modal.classList.remove('hidden');
  },

  async showLeaderboard() {
    const modal = document.getElementById('modal-leaderboard');
    const content = document.getElementById('leaderboard-content');
    
    try {
      const res = await fetch('/api/auth/stats/leaderboard');
      const leaderboard = await res.json();
      
      if (leaderboard.length === 0) {
        content.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">No games played yet!</p>';
      } else {
        content.innerHTML = `<table class="leaderboard-table"><thead><tr><th>#</th><th>Player</th><th>Marks</th><th>Games</th></tr></thead><tbody>
          ${leaderboard.map((p, i) => `<tr>
            <td class="leaderboard-rank">${i + 1}</td>
            <td>${p.displayName}</td>
            <td style="font-weight:700;color:var(--accent-primary)">${p.total_marks}</td>
            <td>${p.games_played}</td>
          </tr>`).join('')}
        </tbody></table>`;
      }
    } catch (e) {
      content.innerHTML = '<p style="color:var(--text-muted)">Could not load leaderboard</p>';
    }
    
    modal.classList.remove('hidden');
  },

  showProfileSettings() {
    const modal = document.getElementById('modal-profile');
    if (!window.currentUser) return;
    
    document.getElementById('edit-displayname').value = window.currentUser.displayName || '';
    
    // Set current profile pic if any
    const preview = document.getElementById('profile-pic-preview');
    if (window.currentUser.profilePic) {
      preview.src = window.currentUser.profilePic;
      preview.style.display = 'block';
      document.getElementById('profile-pic-placeholder').style.display = 'none';
      this.pendingProfilePic = window.currentUser.profilePic;
    } else {
      preview.src = '';
      preview.style.display = 'none';
      document.getElementById('profile-pic-placeholder').style.display = 'flex';
      this.pendingProfilePic = null;
    }
    
    modal.classList.remove('hidden');
  },

  handleProfilePicSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Optional: add strict size/type checking here
    const reader = new FileReader();
    reader.onload = (event) => {
      // Resize image using canvas to ensure it's small (e.g. max 128x128)
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSize = 128;
        let width = img.width;
        let height = img.height;
        
        if (width > height && width > maxSize) {
          height *= maxSize / width;
          width = maxSize;
        } else if (height > maxSize) {
          width *= maxSize / height;
          height = maxSize;
        } else {
           width = maxSize;
           height = maxSize;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        this.pendingProfilePic = dataUrl;
        
        const preview = document.getElementById('profile-pic-preview');
        preview.src = dataUrl;
        preview.style.display = 'block';
        document.getElementById('profile-pic-placeholder').style.display = 'none';
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  },

  async saveProfile() {
    const displayName = document.getElementById('edit-displayname').value.trim();
    const btnSave = document.getElementById('btn-save-profile');
    
    if (!displayName) {
      Animations.showToast('Display name cannot be empty', 'error');
      return;
    }

    try {
      btnSave.disabled = true;
      const res = await fetch('/api/auth/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${window.authToken}`
        },
        body: JSON.stringify({ displayName, profilePic: this.pendingProfilePic })
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to update profile');
      
      // Update local storage and currentUser
      window.currentUser = data;
      const cached = JSON.parse(localStorage.getItem('304_user') || '{}');
      Object.assign(cached, { displayName: data.displayName, profilePic: data.profilePic });
      localStorage.setItem('304_user', JSON.stringify(cached));
      
      // Visual update in lobby
      document.getElementById('lobby-username').textContent = data.displayName;
      
      Animations.showToast('Profile updated!', 'success');
      document.getElementById('modal-profile').classList.add('hidden');
    } catch (e) {
      Animations.showToast(e.message, 'error');
    } finally {
      btnSave.disabled = false;
    }
  },

  reset() {
    this.currentRoomId = null;
    this.mySeat = null;
    document.getElementById('room-area').classList.add('hidden');
  }
};

window.LobbyUI = LobbyUI;
