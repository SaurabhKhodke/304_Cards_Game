// ============================================================
// Animations Module – Shuffle overlay, deal, trick effects, turn glow
// ============================================================

const Animations = {
  _toastDedup: new Map(), // message -> timestamp, for dedup

  /** Show a toast notification (deduplicated within 1.5s) */
  showToast(message, type = 'info', duration = 3500) {
    const now = Date.now();
    const last = this._toastDedup.get(message);
    if (last && now - last < 1500) return; // deduplicate
    this._toastDedup.set(message, now);

    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(12px) scale(0.9)';
      toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      setTimeout(() => toast.remove(), 320);
    }, duration);
  },

  // ============================================================
  // Shuffle Overlay
  // ============================================================
  showShuffleOverlay() {
    // Remove existing if any
    this.hideShuffleOverlay();

    const overlay = document.createElement('div');
    overlay.id = 'shuffle-overlay';
    overlay.innerHTML = `
      <div class="shuffle-deck-visual animate">
        <div class="deck-layer"></div>
        <div class="deck-layer"></div>
        <div class="deck-layer"></div>
      </div>
      <div class="shuffle-text">Shuffling Deck</div>
      <div class="shuffle-dots">
        <span></span><span></span><span></span>
      </div>
    `;
    document.body.appendChild(overlay);
  },

  hideShuffleOverlay() {
    const existing = document.getElementById('shuffle-overlay');
    if (existing) {
      existing.style.opacity = '0';
      existing.style.transition = 'opacity 0.4s ease';
      setTimeout(() => existing.remove(), 420);
    }
  },

  // ============================================================
  // Deal cards into hand (staggered)
  // ============================================================
  dealCardsToHand(container) {
    container.classList.add('deal-animate');
    // Remove class after all animations complete
    setTimeout(() => container.classList.remove('deal-animate'), 1600);
  },

  // ============================================================
  // Show shuffle + deal sequence
  // ============================================================
  async showShuffle(durationMs = 1800) {
    this.showShuffleOverlay();
    return new Promise(resolve => {
      setTimeout(() => {
        this.hideShuffleOverlay();
        resolve();
      }, durationMs);
    });
  },

  // ============================================================
  // Center Announcement Animation (e.g., Hukum/Partner)
  // ============================================================
  showCenterDisplay(title, subtitleHtml, duration = 3000) {
    const existing = document.getElementById('center-display-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'center-display-overlay';
    overlay.innerHTML = `
      <div class="center-display-box animate">
        <h3>${title}</h3>
        <div class="display-content">${subtitleHtml}</div>
      </div>
    `;
    document.body.appendChild(overlay);

    setTimeout(() => {
      if (overlay.parentNode) {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.4s ease';
        setTimeout(() => overlay.remove(), 420);
      }
    }, duration);
  },

  // ============================================================
  // Clear trick area
  // ============================================================
  clearTrickArea() {
    ['trick-top', 'trick-bottom', 'trick-left', 'trick-right'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '';
    });
  },

  // ============================================================
  // Show trick winner pill
  // ============================================================
  showTrickWinner(name) {
    const existing = document.querySelector('.trick-winner-text');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.className = 'trick-winner-text';
    el.textContent = `🏆 ${name} won the trick!`;

    Object.assign(el.style, {
      position: 'fixed',
      top: '76px',
      left: '50%',
      transform: 'translateX(-50%) translateY(-16px)',
      background: 'linear-gradient(135deg,rgba(16,185,129,0.97),rgba(5,150,105,0.97))',
      border: '1px solid rgba(16,185,129,0.6)',
      color: '#fff',
      padding: '10px 26px',
      borderRadius: '30px',
      fontSize: '0.97rem',
      fontFamily: 'var(--font-heading)',
      fontWeight: '800',
      boxShadow: '0 6px 24px rgba(16,185,129,0.45)',
      zIndex: '9999',
      opacity: '0',
      transition: 'opacity 0.3s ease, transform 0.35s cubic-bezier(0.34,1.56,0.64,1)',
      whiteSpace: 'nowrap',
      letterSpacing: '0.2px'
    });

    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateX(-50%) translateY(0)';
    });

    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-50%) translateY(-14px)';
      setTimeout(() => { if (el.parentNode) el.remove(); }, 350);
    }, 2200);
  },

  // ============================================================
  // Highlight active player's avatar AND parent area
  // ============================================================
  setActivePlayer(position) {
    // Remove from all avatars and areas
    document.querySelectorAll('.player-avatar').forEach(a => a.classList.remove('active-turn'));
    document.querySelectorAll('.player-area').forEach(a => a.classList.remove('active-player-area'));
    if (!position) return;

    if (position === 'bottom') {
      const myAv = document.getElementById('my-player-avatar');
      if (myAv) myAv.classList.add('active-turn');
    } else {
      const avatarId = `avatar-${position}`;
      const el = document.getElementById(avatarId);
      if (el) el.classList.add('active-turn');
      const area = document.querySelector(`.player-${position}`);
      if (area) area.classList.add('active-player-area');
    }
  },

  // ============================================================
  // Show partner revealed badge
  // ============================================================
  showPartnerReveal(name) {
    const existing = document.querySelector('.partner-reveal-badge');
    if (existing) existing.remove();

    const center = document.querySelector('.trick-center');
    if (!center) return;
    const el = document.createElement('div');
    el.className = 'partner-reveal-badge';
    el.innerHTML = `🤝 Partner Revealed!<br><strong>${name}</strong>`;
    center.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 3200);
  }
};

window.Animations = Animations;
