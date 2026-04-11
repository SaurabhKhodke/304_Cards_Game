// ============================================================
// Animations Module – Shuffle overlay, deal, trick effects, turn glow
// ============================================================

const Animations = {

  /** Show a toast notification */
  showToast(message, type = 'info', duration = 3500) {
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
  // Show trick winner text (gold pill top banner)
  // ============================================================
  showTrickWinner(name) {
    const existing = document.querySelector('.trick-winner-text');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.className = 'trick-winner-text';
    el.textContent = `🏆 Player ${name} won the trick`;
    
    // Style as a top banner to avoid overlapping cards
    el.style.position = 'fixed';
    el.style.top = '80px';
    el.style.left = '50%';
    el.style.transform = 'translateX(-50%) translateY(-20px)';
    el.style.backgroundColor = 'rgba(0,0,0,0.85)';
    el.style.border = '1px solid var(--gold)';
    el.style.color = '#fff';
    el.style.padding = '12px 24px';
    el.style.borderRadius = '30px';
    el.style.fontSize = '1.1rem';
    el.style.fontFamily = 'var(--font-heading)';
    el.style.boxShadow = '0 5px 15px rgba(0,0,0,0.5), 0 0 10px rgba(234, 179, 8, 0.4)';
    el.style.zIndex = '9999';
    el.style.transition = 'opacity 0.4s ease, transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    el.style.opacity = '0';
    
    document.body.appendChild(el);
    
    // Trigger animation
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateX(-50%) translateY(0)';
    });

    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-50%) translateY(-20px)';
      setTimeout(() => { if (el.parentNode) el.remove(); }, 400);
    }, 2400);
  },

  // ============================================================
  // Highlight active player's avatar (turn glow ring)
  // ============================================================
  setActivePlayer(position) {
    // Remove from all
    document.querySelectorAll('.player-avatar').forEach(a => a.classList.remove('active-turn'));
    if (!position) return;

    // 'bottom' is my hand area, highlight my chip
    const avatarId = position === 'bottom'
      ? 'my-player-avatar'
      : `avatar-${position}`;
    const el = document.getElementById(avatarId);
    if (el) el.classList.add('active-turn');
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
