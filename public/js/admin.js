const AdminUI = {
  init() {
    this.setupNavigation();
    this.setupMaintenance();
    this.setupModals();

    const logoutBtn = document.getElementById('btn-admin-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        AuthUI.logout();
      });
    }

    const refreshPlayersBtn = document.getElementById('btn-admin-refresh-players');
    if (refreshPlayersBtn) refreshPlayersBtn.addEventListener('click', () => this.loadPlayers());

    const refreshRoomsBtn = document.getElementById('btn-admin-refresh-rooms');
    if (refreshRoomsBtn) refreshRoomsBtn.addEventListener('click', () => this.loadRooms());

    const searchPlayers = document.getElementById('admin-search-players');
    if (searchPlayers) {
      searchPlayers.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('#admin-players-table tbody tr').forEach(tr => {
          const text = tr.textContent.toLowerCase();
          tr.style.display = text.includes(term) ? '' : 'none';
        });
      });
    }

    // Spectator leave button
    const leaveSpectateBtn = document.getElementById('btn-leave-spectate');
    if (leaveSpectateBtn) {
      leaveSpectateBtn.addEventListener('click', () => {
        this.leaveSpectate();
      });
    }

    // Initial load will happen on onLogin() if they log in dynamically
    // But if page reloaded with token, auth.js calls it
  },

  onLogin() {
    console.log('[DEBUG AdminUI] onLogin called');
    SocketClient.emit('admin:subscribe');

    // Listen for live updates
    SocketClient.socket.off('admin:dashboardUpdate');
    SocketClient.socket.on('admin:dashboardUpdate', (payload) => {
      console.log('[DEBUG AdminUI] Received admin:dashboardUpdate:', payload);
      this.updateDashboardState(payload);
    });

    this.loadOverview();
    this.loadPlayers();
    this.loadRooms();
  },

  updateDashboardState(payload) {
    if (payload.overview) {
      document.getElementById('admin-stat-users').textContent = payload.overview.totalUsers;
      document.getElementById('admin-stat-rooms').textContent = payload.overview.activeRooms;
      document.getElementById('admin-stat-live').textContent = payload.overview.liveGames;
      document.getElementById('admin-stat-rounds').textContent = payload.overview.totalRoundsPlayed;
    }

    // Only live-update rooms if we are on the rooms tab to prevent jank
    const roomsTab = document.getElementById('admin-tab-rooms');
    if (payload.rooms && roomsTab && !roomsTab.classList.contains('hidden')) {
      this.renderRoomsTable(payload.rooms);
    }
  },

  setupNavigation() {
    document.querySelectorAll('.admin-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');

        document.querySelectorAll('.admin-content').forEach(c => {
          c.classList.add('hidden');
          c.classList.remove('active');
        });

        const targetId = `admin-tab-${e.target.dataset.tab}`;
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
          targetEl.classList.remove('hidden');
          targetEl.classList.add('active');
        }

        this.loadTab(e.target.dataset.tab);
      });
    });
  },

  loadTab(tabName) {
    if (tabName === 'overview') this.loadOverview();
    else if (tabName === 'players') this.loadPlayers();
    else if (tabName === 'rooms') this.loadRooms();
  },

  async fetchAdmin(url, options = {}) {
    if (!window.authToken) return null;
    console.log(`[DEBUG AdminUI] Fetching ${url}`);
    const res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${window.authToken}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    if (!res.ok) {
      const err = await res.json();
      console.error(`[DEBUG AdminUI] Fetch failed for ${url}:`, err);
      Animations.showToast(`Error: ${err.error}`, 'error');
      throw new Error(err.error);
    }
    const data = await res.json();
    console.log(`[DEBUG AdminUI] Fetch success for ${url}:`, data);
    return data;
  },

  async loadOverview() {
    try {
      const data = await this.fetchAdmin('/api/admin/overview');
      document.getElementById('admin-stat-users').textContent = data.totalUsers;
      document.getElementById('admin-stat-rooms').textContent = data.activeRooms;
      document.getElementById('admin-stat-live').textContent = data.liveGames;
      document.getElementById('admin-stat-rounds').textContent = data.totalRoundsPlayed;
    } catch (e) { }
  },

  async loadPlayers() {
    try {
      const players = await this.fetchAdmin('/api/admin/players');
      const tbody = document.querySelector('#admin-players-table tbody');
      if (!tbody) return;
      tbody.innerHTML = '';

      players.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${p.id}</td>
          <td>${p.username}</td>
          <td>${p.displayName}</td>
          <td>${p.role}</td>
          <td class="admin-btn-group">
            <button class="btn-sm btn-sm-primary btn-edit-player" data-id="${p.id}" data-name="${p.displayName}">Edit</button>
            <button class="btn-sm btn-sm-warn btn-pass-player" data-id="${p.id}">Pass</button>
            <button class="btn-sm btn-sm-ghost btn-reset-stats" data-id="${p.id}">Reset Stats</button>
            ${p.username !== 'ADMIN' ? `<button class="btn-sm btn-sm-danger btn-del-player" data-id="${p.id}">Del</button>` : ''}
          </td>
        `;
        tbody.appendChild(tr);
      });

      document.querySelectorAll('.btn-edit-player').forEach(b => b.addEventListener('click', (e) => {
        document.getElementById('admin-edit-userid').value = e.target.dataset.id;
        document.getElementById('admin-edit-displayname').value = e.target.dataset.name;
        document.getElementById('admin-modal-edit').classList.remove('hidden');
      }));

      document.querySelectorAll('.btn-pass-player').forEach(b => b.addEventListener('click', (e) => {
        document.getElementById('admin-pass-userid').value = e.target.dataset.id;
        document.getElementById('admin-new-password').value = '';
        document.getElementById('admin-modal-password').classList.remove('hidden');
      }));

      document.querySelectorAll('.btn-reset-stats').forEach(b => b.addEventListener('click', (e) => {
        if (confirm('Are you sure you want to reset this player\'s stats to zero?')) {
          this.fetchAdmin(`/api/admin/players/${e.target.dataset.id}/reset-stats`, { method: 'POST' })
            .then(() => Animations.showToast('Stats reset successfully', 'success'));
        }
      }));

      document.querySelectorAll('.btn-del-player').forEach(b => b.addEventListener('click', (e) => {
        if (confirm('Are you SURE you want to delete this player? This cannot be undone.')) {
          this.fetchAdmin(`/api/admin/players/${e.target.dataset.id}`, { method: 'DELETE' })
            .then(() => {
              Animations.showToast('Player deleted', 'success');
              this.loadPlayers();
            });
        }
      }));

    } catch (e) { }
  },

  async loadRooms() {
    try {
      const rooms = await this.fetchAdmin('/api/admin/rooms');
      this.renderRoomsTable(rooms);
    } catch (e) { }
  },

  renderRoomsTable(rooms) {
    const tbody = document.querySelector('#admin-rooms-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    rooms.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${r.id}</strong></td>
        <td>${r.playersCount}/4</td>
        <td>${r.gameStarted ? 'Started' : 'Waiting'}</td>
        <td>${r.phase || '-'}</td>
        <td class="admin-btn-group">
          <button class="btn-sm btn-sm-primary btn-spectate" data-id="${r.id}">Spectate</button>
          <button class="btn-sm btn-sm-danger btn-end-room" data-id="${r.id}">Force End</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    document.querySelectorAll('.btn-spectate').forEach(b => b.addEventListener('click', (e) => {
      this.spectateRoom(e.target.dataset.id);
    }));

    document.querySelectorAll('.btn-end-room').forEach(b => b.addEventListener('click', (e) => {
      if (confirm(`Force end room ${e.target.dataset.id}? All players will be disconnected.`)) {
        this.fetchAdmin(`/api/admin/rooms/${e.target.dataset.id}/force-end`, { method: 'POST' })
          .then(() => {
            Animations.showToast('Room ended', 'success');
            this.loadRooms();
          });
      }
    }));
  },

  setupMaintenance() {
    const btnDemo = document.getElementById('btn-admin-clear-demo');
    if (btnDemo) {
      btnDemo.addEventListener('click', () => {
        if (confirm('Delete all users with "demo" or "test" in their username?')) {
          this.fetchAdmin('/api/admin/maintenance/clear-demo-users', { method: 'POST' })
            .then(res => Animations.showToast(`Deleted ${res.deletedCount} demo users`, 'success'));
        }
      });
    }

    const btnStats = document.getElementById('btn-admin-reset-stats');
    if (btnStats) {
      btnStats.addEventListener('click', () => {
        if (confirm('WARNING: Reset ALL player stats across the entire system?')) {
          this.fetchAdmin('/api/admin/maintenance/reset-all-stats', { method: 'POST' })
            .then(() => Animations.showToast('All stats reset', 'success'));
        }
      });
    }

    const btnHistory = document.getElementById('btn-admin-clear-history');
    if (btnHistory) {
      btnHistory.addEventListener('click', () => {
        if (confirm('WARNING: Delete all game history logs?')) {
          this.fetchAdmin('/api/admin/maintenance/clear-history', { method: 'POST' })
            .then(() => Animations.showToast('History cleared', 'success'));
        }
      });
    }
  },

  setupModals() {
    const savePlayerBtn = document.getElementById('btn-admin-save-player');
    if (savePlayerBtn) {
      savePlayerBtn.addEventListener('click', async () => {
        const id = document.getElementById('admin-edit-userid').value;
        const name = document.getElementById('admin-edit-displayname').value;
        try {
          await this.fetchAdmin(`/api/admin/players/${id}/edit`, {
            method: 'POST',
            body: JSON.stringify({ displayName: name })
          });
          document.getElementById('admin-modal-edit').classList.add('hidden');
          Animations.showToast('Player updated', 'success');
          this.loadPlayers();
        } catch (e) { }
      });
    }

    const savePassBtn = document.getElementById('btn-admin-save-password');
    if (savePassBtn) {
      savePassBtn.addEventListener('click', async () => {
        const id = document.getElementById('admin-pass-userid').value;
        const pass = document.getElementById('admin-new-password').value;
        try {
          await this.fetchAdmin(`/api/admin/players/${id}/reset-password`, {
            method: 'POST',
            body: JSON.stringify({ newPassword: pass })
          });
          document.getElementById('admin-modal-password').classList.add('hidden');
          Animations.showToast('Password reset successfully', 'success');
        } catch (e) { }
      });
    }
  },

  spectateRoom(roomId) {
    SocketClient.emit('admin:spectateRoom', roomId, (res) => {
      if (!res.success) {
        Animations.showToast(res.error, 'error');
        return;
      }

      SocketClient.isSpectator = true;
      SocketClient.roomId = roomId;

      // Transition to game screen
      App.showScreen('game');
      document.getElementById('screen-game').classList.add('spectator-mode');
      document.getElementById('spectator-header').classList.remove('hidden');

      // Initialize spectator UI state
      GameUI.reset();

      if (res.gameStarted && res.gameState) {
        GameUI.handleFullState(res.gameState, res.room);
      } else {
        document.getElementById('phase-display').textContent = 'Waiting to start...';
        GameUI.roomState = res.room;
        GameUI.updatePlayerNames(res.room.seats);
      }
    });
  },

  leaveSpectate() {
    SocketClient.emit('admin:leaveSpectate', () => {
      SocketClient.isSpectator = false;
      SocketClient.roomId = null;

      App.showScreen('admin');
      document.getElementById('screen-game').classList.remove('spectator-mode');
      document.getElementById('spectator-header').classList.add('hidden');
      GameUI.reset();
      this.loadRooms();
    });
  }
};

window.AdminUI = AdminUI;
