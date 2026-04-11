// ============================================================
// Auth UI - Login / Register / Token Management
// ============================================================

const AuthUI = {
  init() {
    // Tab switching
    document.getElementById('tab-login').addEventListener('click', () => this.showTab('login'));
    document.getElementById('tab-register').addEventListener('click', () => this.showTab('register'));

    // Form submissions
    document.getElementById('form-login').addEventListener('submit', (e) => {
      e.preventDefault();
      this.login();
    });
    document.getElementById('form-register').addEventListener('submit', (e) => {
      e.preventDefault();
      this.register();
    });

    // Check for existing token
    const token = localStorage.getItem('304_token');
    const user = localStorage.getItem('304_user');
    if (token && user) {
      this.onLoginSuccess(token, JSON.parse(user), true);
    }
  },

  showTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    
    if (tab === 'login') {
      document.getElementById('form-login').classList.remove('hidden');
      document.getElementById('form-register').classList.add('hidden');
    } else {
      document.getElementById('form-login').classList.add('hidden');
      document.getElementById('form-register').classList.remove('hidden');
    }
  },

  async login() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';
    errorEl.classList.add('hidden');

    if (!username || !password) {
      errorEl.textContent = 'Please fill in all fields';
      errorEl.classList.remove('hidden');
      return;
    }

    try {
      document.getElementById('btn-login').disabled = true;
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error);
      this.onLoginSuccess(data.token, data.user);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
    } finally {
      document.getElementById('btn-login').disabled = false;
    }
  },

  async register() {
    const username = document.getElementById('reg-username').value.trim();
    const displayName = document.getElementById('reg-displayname').value.trim();
    const password = document.getElementById('reg-password').value;
    const errorEl = document.getElementById('register-error');
    errorEl.textContent = '';
    errorEl.classList.add('hidden');

    if (!username || !password) {
      errorEl.textContent = 'Please fill in required fields';
      errorEl.classList.remove('hidden');
      return;
    }

    try {
      document.getElementById('btn-register').disabled = true;
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, displayName: displayName || username })
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error);
      this.onLoginSuccess(data.token, data.user);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
    } finally {
      document.getElementById('btn-register').disabled = false;
    }
  },

  onLoginSuccess(token, user, autoLogin = false) {
    localStorage.setItem('304_token', token);
    localStorage.setItem('304_user', JSON.stringify(user));
    
    window.currentUser = user;
    window.authToken = token;

    // Connect socket
    SocketClient.connect(token);

    // Show lobby
    App.showScreen('lobby');
    document.getElementById('lobby-username').textContent = user.displayName;
    
    if (!autoLogin) {
      Animations.showToast(`Welcome, ${user.displayName}!`, 'success');
    }
  },

  logout() {
    localStorage.removeItem('304_token');
    localStorage.removeItem('304_user');
    window.currentUser = null;
    window.authToken = null;
    SocketClient.disconnect();
    App.showScreen('auth');
  }
};

window.AuthUI = AuthUI;
