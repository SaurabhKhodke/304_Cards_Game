// ============================================================
// Game UI - Main game screen logic
// Handles all game phases: dealing, vakhai, bidding,
// hukum/partner selection, trick play, scoring
// ============================================================

const GameUI = {
  gameState: null,
  roomState: null,
  mySeat: null,
  selectedPartnerCard: null,
  handSorted: false,  // Track if user used sort

  init() {
    // Scoreboard toggle
    document.getElementById('btn-scoreboard').addEventListener('click', () => {
      document.getElementById('scoreboard-overlay').classList.toggle('hidden');
    });
    document.getElementById('btn-close-scoreboard').addEventListener('click', () => {
      document.getElementById('scoreboard-overlay').classList.add('hidden');
    });

    // History toggle
    document.getElementById('btn-history').addEventListener('click', () => {
      document.getElementById('history-overlay').classList.toggle('hidden');
    });
    document.getElementById('btn-close-history').addEventListener('click', () => {
      document.getElementById('history-overlay').classList.add('hidden');
    });

    // Vakhai buttons
    document.getElementById('btn-vakhai-3').addEventListener('click', () => this.sendVakhai('declare', 3));
    document.getElementById('btn-vakhai-5').addEventListener('click', () => this.sendVakhai('declare', 5));
    document.getElementById('btn-vakhai-pass').addEventListener('click', () => this.sendVakhai('pass', 0));

    // Bid buttons
    document.querySelectorAll('.btn-bid').forEach(btn => {
      btn.addEventListener('click', () => this.sendBid('bid', parseInt(btn.dataset.bid)));
    });
    document.getElementById('btn-custom-bid').addEventListener('click', () => {
      const val = parseInt(document.getElementById('custom-bid-input').value);
      if (val) this.sendBid('bid', val);
    });
    document.getElementById('btn-bid-pass').addEventListener('click', () => this.sendBid('pass', 0));

    // Hukum selection
    document.querySelectorAll('.btn-suit').forEach(btn => {
      btn.addEventListener('click', () => this.sendHukumSelect(btn.dataset.suit));
    });

    // Partner confirm
    document.getElementById('btn-confirm-partner').addEventListener('click', () => this.sendPartnerSelect());

    // Sort button
    document.getElementById('btn-sort-hand').addEventListener('click', () => this.sortMyHand());

    // Next round
    document.getElementById('btn-next-round').addEventListener('click', () => this.sendNextRound());

    // Back to lobby
    document.getElementById('btn-back-lobby').addEventListener('click', () => {
      this.reset();
      App.showScreen('lobby');
      // If we are still in a room, the lobby UI will automatically display the existing room state
      // since it processes 'room:update' events continuously.
      if (SocketClient.roomId && LobbyUI.currentRoomId !== SocketClient.roomId) {
         // Fallback sync if lobby got disconnected from state
         SocketClient.emit('room:join', SocketClient.roomId, (res) => {
             if (res && res.success) LobbyUI.updateRoomDisplay(res.room);
         });
      }
    });

    // Force Reveal
    const revealBtn = document.getElementById('btn-reveal-partner');
    if (revealBtn) revealBtn.addEventListener('click', () => this.sendForceReveal());

    // Marriage logic
    const btnDeclareMarriage = document.getElementById('btn-declare-marriage');
    if (btnDeclareMarriage) {
      btnDeclareMarriage.addEventListener('click', () => {
        const suit = document.getElementById('marriage-suit-select').value;
        if (suit) this.sendDeclareMarriage(suit);
      });
    }

    // Setup socket listeners
    this.setupSocketEvents();
  },

  setupSocketEvents() {
    SocketClient.on('game:state', (state) => this.handleFullState(state));
    SocketClient.on('game:dealing', (data) => this.onDealing(data));
    SocketClient.on('game:cardsDealt', (data) => this.onCardsDealt(data));
    SocketClient.on('game:vakhaiStart', (data) => this.onVakhaiStart(data));
    SocketClient.on('game:vakhaiUpdate', (data) => this.onVakhaiUpdate(data));
    SocketClient.on('game:vakhaiResults', (data) => this.onVakhaiResults(data));
    SocketClient.on('game:vakhaiTrickStart', (data) => this.onVakhaiTrickStart(data));
    SocketClient.on('game:biddingStart', (data) => this.onBiddingStart(data));
    SocketClient.on('game:biddingUpdate', (data) => this.onBiddingUpdate(data));
    SocketClient.on('game:hukumSelect', (data) => this.onHukumSelect(data));
    SocketClient.on('game:hukumSelected', (data) => this.onHukumSelected(data));
    SocketClient.on('game:partnerSelect', (data) => this.onPartnerSelect(data));
    SocketClient.on('game:partnerSelected', (data) => this.onPartnerSelected(data));
    SocketClient.on('game:trickPlayStart', (data) => this.onTrickPlayStart(data));
    SocketClient.on('game:cardPlayed', (data) => this.onCardPlayed(data));
    SocketClient.on('game:trickComplete', (data) => this.onTrickComplete(data));
    SocketClient.on('game:roundEnd', (data) => this.onRoundEnd(data));
    SocketClient.on('game:roundReadyState', (data) => this.onRoundReadyState(data));
    SocketClient.on('game:partnerForceRevealed', (data) => this.onPartnerForceRevealed(data));
    SocketClient.on('game:marriageDeclared', (data) => this.onMarriageDeclared(data));
    // Hydration: server restores full state after reconnect
    // (main handler in socket.js; this secondary hook is for UI consistency)
    SocketClient.on('game:hydrate', (payload) => {
      if (payload.seat && !this.mySeat) this.mySeat = payload.seat;
      if (payload.gameState) this.handleFullState(payload.gameState, payload.roomState);
    });

    // Periodic safety resync if game is active (every 30s)
    setInterval(() => {
      if (App.currentScreen === 'game' && SocketClient.socket?.connected) {
        SocketClient.requestSync();
      }
    }, 30000);
  },

  // ============================================================
  // Game Started
  // ============================================================
  onGameStarted(data) {
    this.roomState = data;
    this.mySeat = LobbyUI.mySeat;
    this.handSorted = false;
    this.partnerMessageShown = false;
    this.updatePlayerNames(data.seats);

    const nameDisplay = document.getElementById('game-username-display');
    if (nameDisplay && window.currentUser) {
      nameDisplay.textContent = `You: ${window.currentUser.displayName}`;
    }
    // Update bottom nameplate chip
    const myChip = document.getElementById('my-player-name-display');
    if (myChip && window.currentUser) {
      myChip.textContent = window.currentUser.displayName || 'You';
    }
  },

  updatePlayerNames(seats) {
    if (!this.mySeat) return;
    const positions = this.getSeatPositions();
    // Avatar emojis by seat for variety
    const avatarMap = ['🎴','🃏','🎲','♟️'];
    for (const pos in positions) {
      const seat = positions[pos];
      const nameEl = document.getElementById(`opponent-${pos}-name`);
      const avatarEl = document.getElementById(`avatar-${pos}`);
      if (seats[seat]) {
        if (nameEl) nameEl.textContent = seats[seat].displayName || '---';
        if (avatarEl) {
          if (seats[seat].profilePic) {
            avatarEl.style.backgroundImage = `url(${seats[seat].profilePic})`;
            avatarEl.style.backgroundSize = 'cover';
            avatarEl.style.backgroundPosition = 'center';
            avatarEl.textContent = '';
          } else {
            const emoji = avatarMap[(seat - 1) % avatarMap.length];
            avatarEl.textContent = emoji;
            avatarEl.style.backgroundImage = 'none';
          }
        }
      }
    }
    // My avatar
    const myAvatar = document.getElementById('my-player-avatar');
    if (myAvatar && window.currentUser) {
      if (window.currentUser.profilePic) {
        myAvatar.style.backgroundImage = `url(${window.currentUser.profilePic})`;
        myAvatar.style.backgroundSize = 'cover';
        myAvatar.style.backgroundPosition = 'center';
        myAvatar.textContent = '';
      } else {
        myAvatar.textContent = '😎';
        myAvatar.style.backgroundImage = 'none';
      }
    }
  },

  getSeatPositions() {
    const s = this.mySeat;
    return {
      'top': ((s - 1 + 2) % 4) + 1,
      'left': ((s - 1 + 1) % 4) + 1,
      'right': ((s - 1 + 3) % 4) + 1
    };
  },

  getSeatPosition(seat) {
    if (seat === this.mySeat) return 'bottom';
    const positions = this.getSeatPositions();
    for (const pos in positions) {
      if (positions[pos] === seat) return pos;
    }
    return null;
  },

  /**
   * Reset all local game state and clear the game table UI 
   * (used when returning to lobby)
   */
  reset() {
    this.gameState = null;
    this.roomState = null;
    this.selectedPartnerCard = null;
    this.handSorted = false;
    this.localHandOrder = null;

    // Clear cards + tricks
    Animations.clearTrickArea();
    document.getElementById('my-hand').innerHTML = '';
    ['top', 'left', 'right'].forEach(pos => {
      const el = document.getElementById(`opponent-${pos}-cards`);
      if (el) el.innerHTML = '';
    });

    // Reset nameplates to empty
    ['top', 'left', 'right'].forEach(pos => {
      const nameEl = document.getElementById(`opponent-${pos}-name`);
      if (nameEl) nameEl.textContent = '---';
      const countEl = document.getElementById(`opponent-${pos}-count`);
      if (countEl) countEl.textContent = '0';
    });

    // Hide overlays and indicators
    this.hideAllPanels();
    document.getElementById('round-result-overlay').classList.add('hidden');
    document.getElementById('scoreboard-overlay').classList.add('hidden');
    document.getElementById('history-overlay').classList.add('hidden');
    document.getElementById('hukum-indicator').classList.add('hidden');
    document.getElementById('partner-indicator').classList.add('hidden');
    
    const turnInd = document.getElementById('turn-indicator');
    if (turnInd) {
       turnInd.classList.add('hidden');
       turnInd.classList.remove('my-turn');
    }
    Animations.setActivePlayer(null);

    // Reset textual indicators
    document.getElementById('game-target-score').textContent = '0';
    document.getElementById('round-display').textContent = 'Round 1';
    document.getElementById('phase-display').textContent = 'Lobby';
  },

  // ============================================================
  // Full State Update (reconnection)
  // ============================================================
  handleFullState(state, room) {
    this.gameState = state;

    // Recover mySeat from multiple sources
    if (!this.mySeat && LobbyUI.mySeat) {
      this.mySeat = LobbyUI.mySeat;
    }
    // Try to find own seat by matching currentUser in room seats
    if (!this.mySeat && room && room.seats && window.currentUser) {
      for (const [s, p] of Object.entries(room.seats)) {
        if (p && String(p.userId) === String(window.currentUser.id)) {
          this.mySeat = parseInt(s);
          LobbyUI.mySeat = this.mySeat;
          break;
        }
      }
    }

    if (room) {
      this.roomState = room;
      if (room.seats) this.updatePlayerNames(room.seats);
    }
    if (!room && this.roomState?.seats) {
      this.updatePlayerNames(this.roomState.seats);
    }

    document.getElementById('round-display').textContent = `Round ${state.roundNumber}`;
    document.getElementById('phase-display').textContent = this.getPhaseLabel(state.phase);

    // Always render hand when we have cards
    if (state.myHand && state.myHand.length > 0) {
      if (this.handSorted && this.localHandOrder) {
        state.myHand.sort((a, b) => {
          let idxA = this.localHandOrder.indexOf(a.id);
          let idxB = this.localHandOrder.indexOf(b.id);
          if (idxA === -1) idxA = 999;
          if (idxB === -1) idxB = 999;
          return idxA - idxB;
        });
      }
      this.renderMyHand(state);
    }

    // Update opponent card counts
    if (state.otherPlayersCardCount) {
      for (const seat in state.otherPlayersCardCount) {
        const pos = this.getSeatPosition(parseInt(seat));
        if (pos && pos !== 'bottom') {
          const countEl = document.getElementById(`opponent-${pos}-count`);
          const cardsEl = document.getElementById(`opponent-${pos}-cards`);
          if (countEl) countEl.textContent = state.otherPlayersCardCount[seat];
          if (cardsEl) CardRenderer.renderOpponentCards(cardsEl, state.otherPlayersCardCount[seat]);
        }
      }
    }

    if (state.hukumSuit) {
      this.showHukumIndicator(state.hukumSuit);
    }
    
    const pEl = document.getElementById('partner-indicator');
    if (state.partnerCard && ['PARTNER_SELECT','TRICK_PLAY','ROUND_END'].includes(state.phase)) {
      this.showPartnerIndicator(state.partnerCard);
    } else if (pEl) {
      pEl.classList.add('hidden');
    }

    if (state.scoring) {
      this.updateScoreboard(state.scoring);
    }

    // Show correct action panel based on phase
    this.hideAllPanels();
    if (state.phase === 'VAKHAI' && state.vakhai) {
      if (state.vakhai.state === 'PLAYING') {
        this.renderTrickState(state.vakhai);
      } else if (state.vakhai.currentTurn === this.mySeat) {
        this.showPanel('vakhai');
        // Ensure buttons are re-enabled
        document.querySelectorAll('#vakhai-panel .btn-action').forEach(b => b.disabled = false);
      }
    } else if (state.phase === 'BIDDING' && state.bidding) {
      this.onBiddingUpdate(state.bidding);
    } else if (state.phase === 'HUKUM_SELECT' && state.bidWinner === this.mySeat) {
      this.showPanel('hukum');
    } else if (state.phase === 'PARTNER_SELECT' && state.bidWinner === this.mySeat) {
      this.showPanel('partner');
      this.setupPartnerSelection();
    } else if (state.phase === 'TRICK_PLAY' && state.trickPlay) {
      this.renderTrickState(state.trickPlay);
      if (state.trickPlay.isBidder && !state.trickPlay.partnerRevealed && state.trickPlay.currentTurn === this.mySeat) {
        this.showPanel('trickplay');
      }
      if (state.bidding && state.bidding.completed) {
        document.getElementById('game-target-score').textContent = state.targetScore || state.bidding.winner.bid;
      }

      this.updateOtherPlayers(state.otherPlayersCardCount || {});
      this.updateTurnIndicator(state);
      this.checkMarriageOptions(state);
    }

    this.updateTurnIndicator(state);

    // Show sort button for first dealing
    this.updateSortButton();
  },

  getPhaseLabel(phase) {
    const labels = {
      'LOBBY': 'Lobby', 'DEALING_FIRST': 'Dealing', 'VAKHAI': 'Vakhai',
      'DEALING_SECOND': 'Dealing', 'BIDDING': 'Bidding',
      'HUKUM_SELECT': 'Select Hukum', 'PARTNER_SELECT': 'Select Partner',
      'TRICK_PLAY': 'Playing', 'ROUND_END': 'Round End', 'GAME_OVER': 'Game Over'
    };
    return labels[phase] || phase;
  },

  // ============================================================
  // Sort Button
  // ============================================================
  sortMyHand() {
    if (!this.gameState || !this.gameState.myHand) return;
    // Black (spades), Red (diamonds), Black (clubs), Red (hearts)
    const suitOrder = { spades: 0, diamonds: 1, clubs: 2, hearts: 3 };
    const rankOrder = { 'J':8, '9':7, 'A':6, '10':5, 'K':4, 'Q':3, '8':2, '7':1 };
    
    this.gameState.myHand.sort((a, b) => {
      if (suitOrder[a.suit] !== suitOrder[b.suit]) {
        return suitOrder[a.suit] - suitOrder[b.suit];
      }
      return (rankOrder[b.rank] || 0) - (rankOrder[a.rank] || 0);
    });
    
    this.handSorted = true;
    this.localHandOrder = this.gameState.myHand.map(c => c.id);
    
    this.renderMyHand(this.gameState);
    
    // Hide sort button after use
    document.getElementById('sort-container').classList.add('hidden');
    Animations.showToast('Cards sorted by suit!', 'success');
  },

  updateSortButton() {
    const container = document.getElementById('sort-container');
    if (!container) return;
    // Show sort button only when we have a full hand (8 cards) and haven't sorted yet
    if (this.gameState?.myHand?.length === 8 && !this.handSorted) {
      container.classList.remove('hidden');
    } else {
      container.classList.add('hidden');
    }
  },

  // ============================================================
  // Dealing
  // ============================================================
  async onDealing(data) {
    document.getElementById('round-display').textContent = `Round ${data.roundNumber}`;
    document.getElementById('phase-display').textContent = 'Dealing';
    
    // Clear old UI states
    this.partnerMessageShown = false;
    const partnerEl = document.getElementById('partner-indicator');
    if (partnerEl) partnerEl.classList.add('hidden');
    const hukumEl = document.getElementById('hukum-indicator');
    if (hukumEl) hukumEl.classList.add('hidden');
    document.getElementById('game-target-score').textContent = '0';
    
    // Clear active turn highlights
    document.querySelectorAll('.player-avatar, .my-player-avatar').forEach(el => el.classList.remove('active-turn'));
    const indicator = document.getElementById('turn-indicator');
    if (indicator) indicator.classList.add('hidden');

    this.hideAllPanels();
    this.handSorted = false;
    this.localHandOrder = null;
    Animations.clearTrickArea();

    await Animations.showShuffle(1500);
  },

  onCardsDealt(data) {
    if (data.hand) {
      this.gameState = this.gameState || {};
      this.gameState.myHand = data.hand;
      this.gameState.phase = data.phase === 'first' ? 'VAKHAI' : 'BIDDING';
      
      document.getElementById('phase-display').textContent = this.getPhaseLabel(this.gameState.phase);
      
      this.renderMyHand(this.gameState);
      Animations.dealCardsToHand(document.getElementById('my-hand'));
      // Show sort button when full hand is dealt (8 cards)
      this.updateSortButton();
    }
  },

  renderMyHand(state) {
    const container = document.getElementById('my-hand');
    const hand = state.myHand || [];
    
    const isTrickTurn = state.phase === 'TRICK_PLAY' && state.trickPlay?.currentTurn === this.mySeat;
    const isVakhaiTurn = state.phase === 'VAKHAI' && state.vakhai?.state === 'PLAYING' && state.vakhai?.currentTurn === this.mySeat;
    const playable = isTrickTurn || isVakhaiTurn;

    let playableCards = null;
    if (playable) {
      const activeObj = isTrickTurn ? state.trickPlay : state.vakhai;
      if (activeObj?.leadSuit) {
        const hasLeadSuit = hand.some(c => c.suit === activeObj.leadSuit);
        if (hasLeadSuit) {
          // Simply highlight lead suit cards
          playableCards = hand.filter(c => c.suit === activeObj.leadSuit).map(c => c.id);
        }
      }
    }

    CardRenderer.renderHand(container, hand, {
      playable,
      playableCards,
      trumpSuit: state.hukumSuit || this.gameState?.hukumSuit,
      onCardClick: playable ? (card) => this.playCard(card) : null
    });

    // Handle Marriage UI
    const marriageActions = document.getElementById('marriage-actions');
    const suitSelect = document.getElementById('marriage-suit-select');
    
    if (state.marriageEligible) {
      // Find suits with both K and Q
      const suitsWithKQ = ['spades', 'hearts', 'diamonds', 'clubs'].filter(s => {
        return hand.some(c => c.rank === 'K' && c.suit === s) && hand.some(c => c.rank === 'Q' && c.suit === s);
      });
      
      if (suitsWithKQ.length > 0) {
        suitSelect.innerHTML = suitsWithKQ.map(s => {
          const char = {'spades':'♠', 'hearts':'♥', 'diamonds':'♦', 'clubs':'♣'}[s];
          return `<option value="${s}">${char} ${s.charAt(0).toUpperCase() + s.slice(1)}</option>`;
        }).join('');
        if (marriageActions) marriageActions.classList.remove('hidden');
      } else {
        if (marriageActions) marriageActions.classList.add('hidden');
      }
    } else {
      if (marriageActions) marriageActions.classList.add('hidden');
    }
  },

  // ============================================================
  // Vakhai Phase
  // ============================================================
  onVakhaiStart(data) {
    document.getElementById('phase-display').textContent = 'Vakhai';
    if (data.currentTurn === this.mySeat) {
      this.showPanel('vakhai');
      document.getElementById('vakhai-desc').textContent = 'You have the first 4 cards. Declare vakhai or pass.';
      // Ensure buttons are re-enabled for the new round
      document.querySelectorAll('#vakhai-panel .btn-action').forEach(b => b.disabled = false);
    } else {
      this.hideAllPanels();
      Animations.showToast('Vakhai phase - waiting for others...', 'info');
    }
  },

  onVakhaiUpdate(data) {
    if (data.currentTurn === this.mySeat && !data.completed) {
      this.showPanel('vakhai');
      document.getElementById('vakhai-desc').textContent = 'Your turn! Declare vakhai or pass.';
      // Ensure buttons are re-enabled
      document.querySelectorAll('#vakhai-panel .btn-action').forEach(b => b.disabled = false);
    } else if (!data.completed) {
      this.hideAllPanels();
    }
  },

  onVakhaiTrickStart(data) {
    this.hideAllPanels();
    document.getElementById('phase-display').textContent = 'Vakhai ▶ Tricks';
    const name = data.declarerName || this.getPlayerName(data.vakhaiDeclarer);
    const stake = data.vakhaiStake || '?';
    Animations.showCenterDisplay(
      'VAKHAI DECLARED!',
      `<div style="text-align:center;font-size:1.1rem">
        <strong style="color:var(--gold)">${name}</strong> declared Vakhai<br>
        <span style="color:#f59e0b">Stake: ${stake} marks</span><br>
        <span style="font-size:0.9rem;opacity:0.8">Must win all 4 tricks!</span>
      </div>`,
      3500
    );
  },

  onVakhaiResults(results) {
    this.hideAllPanels();
    if (!Array.isArray(results)) return;

    // Determine overall outcome
    const declarer = results.find(r => !r.fromChallenge);
    if (declarer) {
      if (declarer.won) {
        const name = this.getPlayerName(declarer.seat);
        Animations.showToast(`🏆 ${name} won Vakhai! (+${declarer.marks} marks)`, 'success');
        Animations.showCenterDisplay(
          '✅ VAKHAI WIN!',
          `<span style="color:var(--gold);font-size:1.3rem">${name} wins ${declarer.marks} marks!</span>`,
          3000
        );
      } else {
        const name = this.getPlayerName(declarer.seat);
        const stake = declarer.stake;
        Animations.showToast(`💥 ${name} lost Vakhai! Others get +${stake} marks`, 'error');
        Animations.showCenterDisplay(
          '❌ VAKHAI FAILED!',
          `<span style="color:#ef4444;font-size:1.1rem">${name} failed.<br>Each other player gets +${stake} marks.</span>`,
          3500
        );
      }
    }
  },

  sendVakhai(action, stake) {
    // Immediately disable all Vakhai buttons to prevent double-fire
    const vBtns = document.querySelectorAll('#vakhai-panel .btn-action');
    vBtns.forEach(b => { b.disabled = true; });

    SocketClient.emit('game:vakhai', { action, stake }, (res) => {
      if (!res.success) {
        Animations.showToast(res.error, 'error');
        // Re-enable only if server rejected (e.g., wrong turn, bad stake)
        vBtns.forEach(b => { b.disabled = false; });
      } else {
        this.hideAllPanels();
      }
    });
  },

  // ============================================================
  // Bidding Phase
  // ============================================================
  onBiddingStart(data) {
    document.getElementById('phase-display').textContent = 'Bidding';
    this.onBiddingUpdate(data);
  },

  onBiddingUpdate(data) {
    const isMyTurn = data.currentTurn === this.mySeat;

    if (data.currentBid > 0) {
      const bidderName = this.getPlayerName(data.currentBidder);
      document.getElementById('current-bid-display').textContent = `${data.currentBid} by ${bidderName}`;
    } else {
      document.getElementById('current-bid-display').textContent = 'None yet';
    }

    if (isMyTurn && !data.completed) {
      this.showPanel('bidding');
      document.querySelectorAll('.btn-bid').forEach(btn => {
        const bid = parseInt(btn.dataset.bid);
        btn.disabled = bid <= data.currentBid;
      });
      document.getElementById('custom-bid-input').min = data.minBid;
      document.getElementById('custom-bid-input').placeholder = `Min: ${data.minBid}`;
    } else if (!data.completed) {
      this.hideAllPanels();
      if (data.currentTurn) {
        const turnName = this.getPlayerName(data.currentTurn);
        Animations.showToast(`${turnName}'s turn to bid`, 'info');
      }
    }

    if (data.completed && data.winner) {
      this.hideAllPanels();
      const winnerName = this.getPlayerName(data.winner.seat);
      Animations.showToast(`${winnerName} won the bid at ${data.winner.bid}!`, 'success');
      document.getElementById('game-target-score').textContent = data.winner.bid;
    }

    this.updateTurnIndicator(this.gameState || { phase: 'BIDDING', bidding: data });
  },

  sendBid(action, amount) {
    SocketClient.emit('game:bid', { action, amount }, (res) => {
      if (!res.success) Animations.showToast(res.error, 'error');
      else this.hideAllPanels();
    });
  },

  // ============================================================
  // Hukum Selection — CARDS MUST BE VISIBLE
  // ============================================================
  onHukumSelect(data) {
    document.getElementById('phase-display').textContent = 'Select Hukum';
    // Always re-render hand so cards are visible during selection
    if (this.gameState?.myHand) {
      this.renderMyHand(this.gameState);
    }
    if (data.bidWinner === this.mySeat) {
      this.showPanel('hukum');
    } else {
      this.hideAllPanels();
      const name = this.getPlayerName(data.bidWinner);
      Animations.showToast(`${name} is choosing hukum (trump)...`, 'info');
    }
  },

  onHukumSelected(data) {
    this.showHukumIndicator(data.hukumSuit);
    if (this.gameState) this.gameState.hukumSuit = data.hukumSuit;
    
    // Feature 1: Show step-by-step animation sequence to all players
    const suitSymbolHtml = `<span style="color: ${['hearts','diamonds'].includes(data.hukumSuit) ? '#ef4444' : '#fff'}; filter: drop-shadow(0 0 20px rgba(255,255,255,0.2))">${{ spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' }[data.hukumSuit] || ''}</span>`;
    Animations.showCenterDisplay('HUKUM SELECTED', suitSymbolHtml, 2500);

    if (this.gameState?.myHand) this.renderMyHand(this.gameState);
  },

  showHukumIndicator(suit) {
    const symbols = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
    const colors = { spades: '#f0f2f5', hearts: '#ef4444', diamonds: '#ef4444', clubs: '#f0f2f5' };
    const el = document.getElementById('hukum-indicator');
    if (el) el.classList.remove('hidden');
    const suitEl = document.getElementById('hukum-suit-display');
    if (suitEl) {
      suitEl.textContent = symbols[suit] || '';
      suitEl.style.color = colors[suit] || '#fff';
    }
  },

  showPartnerIndicator(cardId) {
    const symbols = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
    const colors = { spades: '#f0f2f5', hearts: '#ef4444', diamonds: '#ef4444', clubs: '#f0f2f5' };
    const parts = cardId.split('_');
    const rank = parts[0].toUpperCase();
    const suit = parts[1];

    const el = document.getElementById('partner-indicator');
    if (el) {
      el.classList.remove('hidden');
      const display = document.getElementById('partner-card-display');
      display.innerHTML = `<span style="color:${colors[suit] || '#fff'}; font-weight:900;">${rank}${symbols[suit] || ''}</span>`;
    }
  },

  sendHukumSelect(suit) {
    SocketClient.emit('game:selectHukum', suit, (res) => {
      if (!res.success) Animations.showToast(res.error, 'error');
      else this.hideAllPanels();
    });
  },

  // ============================================================
  // Partner Selection — CARDS MUST BE VISIBLE
  // ============================================================
  onPartnerSelect(data) {
    document.getElementById('phase-display').textContent = 'Select Partner';
    // Re-render hand so cards are visible
    if (this.gameState?.myHand) {
      this.renderMyHand(this.gameState);
    }
    if (data.bidWinner === this.mySeat) {
      this.showPanel('partner');
      this.setupPartnerSelection();
    } else {
      this.hideAllPanels();
      const name = this.getPlayerName(data.bidWinner);
      Animations.showToast(`${name} is choosing partner card...`, 'info');
    }
  },

  setupPartnerSelection() {
    this.selectedPartnerCard = null;
    document.getElementById('btn-confirm-partner').disabled = true;
    const container = document.getElementById('partner-card-options');
    
    // Feature 1: Filter Partner Options
    const excludeIds = this.gameState && this.gameState.myHand ? this.gameState.myHand.map(c => c.id) : [];
    
    CardRenderer.renderPartnerOptions(container, excludeIds, (cardId) => {
      this.selectedPartnerCard = cardId;
      document.getElementById('btn-confirm-partner').disabled = false;
    });
  },

  onPartnerSelected(data) {
    this.hideAllPanels();
    if (data && data.cardId) {
      const parts = data.cardId.split('_');
      const rank = parts[0];
      const suit = parts[1];
      const color = ['hearts', 'diamonds'].includes(suit) ? '#ef4444' : '#fff';
      const symbol = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' }[suit] || suit;
      
      const cardHtml = `<div style="display:inline-block; background:rgba(255,255,255,0.1); border:2px solid var(--border-gold); padding:20px 40px; border-radius:12px; transform:scale(1.2); box-shadow:0 0 30px rgba(0,0,0,0.5);">
        <span style="color:${color}; font-family:var(--font-heading);">${rank}${symbol}</span>
      </div>`;
      
      Animations.showCenterDisplay('PARTNER CARD SELECTED', cardHtml, 3000);
      Animations.showToast(`Partner card is ${rank}${symbol}`, 'warning');
    } else {
      Animations.showToast('Partner card selected. Trick play starting!', 'info');
    }
  },

  sendPartnerSelect() {
    if (!this.selectedPartnerCard) return;
    SocketClient.emit('game:selectPartner', this.selectedPartnerCard, (res) => {
      if (!res.success) Animations.showToast(res.error, 'error');
      else this.hideAllPanels();
    });
  },

  onPartnerForceRevealed(data) {
    if (data.calledOut) {
       Animations.showToast(`👉 Partner Out for this Trick`, 'warning');
    } else {
       const name = this.getPlayerName(data.seat);
       Animations.showToast(`Partner Opened: ${name}!`, 'warning');
    }
    
    if (this.gameState && this.gameState.trickPlay) {
      this.gameState.trickPlay.partnerRevealed = true;
      if (data.seat) this.gameState.trickPlay.partnerSeat = data.seat;
    }
    this.hideAllPanels();
  },

  sendForceReveal() {
    SocketClient.emit('game:forceRevealPartner', null, (res) => {
      if (!res.success) Animations.showToast(res.error || 'Could not reveal partner', 'error');
      else this.hideAllPanels();
    });
  },

  // ============================================================
  // Trick Play
  // ============================================================
  onTrickPlayStart(data) {
    document.getElementById('phase-display').textContent = 'Playing';
    Animations.clearTrickArea();
    this.hideAllPanels();
    if (this.gameState) this.gameState.phase = 'TRICK_PLAY';
    if (data.firstPlayer === this.mySeat) {
      Animations.showToast('Your lead! Play any card.', 'info');
    }
    if (this.gameState?.myHand) this.renderMyHand(this.gameState);
  },

  onCardPlayed(data) {
    const pos = this.getSeatPosition(data.seat);
    if (pos) {
      const slotId = `trick-${pos}`;
      const slot = document.getElementById(slotId);
      if (data.card) {
        CardRenderer.renderTrickCard(slot, data.card);
      }
    }
    // Update hand if it's our card
    if (data.seat === this.mySeat && this.gameState) {
      this.gameState.myHand = this.gameState.myHand.filter(c => c.id !== data.cardId);
      this.renderMyHand(this.gameState);
    }
  },

  onMarriageDeclared(data) {
    const name = this.getPlayerName(data.seat);
    const suitIcon = { 'spades': '♠', 'hearts': '♥', 'diamonds': '♦', 'clubs': '♣' }[data.suit];
    const color = ['hearts','diamonds'].includes(data.suit) ? '#ef4444' : '#fff';
    
    Animations.showCenterDisplay(
      '💍 MARRIAGE DECLARED',
      `<span style="color: ${color}; font-size: 2rem;">${suitIcon}</span><br><span style="font-size:1rem;color:var(--gold);">${name}</span>`,
      2500
    );
    
    setTimeout(() => {
      Animations.showToast(`Target score adjusted by ${data.targetAdj > 0 ? '+' : ''}${data.targetAdj}`, 'info');
      document.getElementById('game-target-score').textContent = data.targetScore;
    }, 2000);
  },

  onTrickComplete(data) {
    const winnerName = this.getPlayerName(data.winner);
    // Add trick glow
    const pos = this.getSeatPosition(data.winner);
    if (pos) {
      const slotId = `trick-${pos}`;
      const slot = document.getElementById(slotId).querySelector('.trick-card');
      if (slot) slot.classList.add('trick-win-glow');
    }

    Animations.showTrickWinner(winnerName);

    if (data.partnerKilledInThisTrick && data.partnerSeat) {
      this.partnerMessageShown = true;
      const partnerName = this.getPlayerName(data.partnerSeat);
      setTimeout(() => {
        Animations.showToast(`Partner KILLED! ${partnerName} joins opponents`, 'error');
      }, 900);
    } else if (data.partnerRevealedInThisTrick && data.partnerSeat && !this.partnerMessageShown) {
      this.partnerMessageShown = true;
      const partnerName = this.getPlayerName(data.partnerSeat);
      setTimeout(() => {
        Animations.showPartnerReveal(partnerName);
        Animations.showToast(`👉 Player ${partnerName} is the Partner`, 'warning');
      }, 900);
    }

    setTimeout(() => {
      Animations.clearTrickArea();
      
      if (data.lastTrickAdjustment) {
        const sign = data.lastTrickAdjustment > 0 ? '+' : '';
        Animations.showToast(`Last Trick Adjustment: ${sign}${data.lastTrickAdjustment}`, 'info');
        document.getElementById('game-target-score').textContent = data.targetScore;
      }
    }, 2200);
  },

  renderTrickState(trickPlay) {
    Animations.clearTrickArea();
    if (trickPlay.currentTrick) {
      trickPlay.currentTrick.forEach(play => {
        const pos = this.getSeatPosition(play.seat);
        if (pos) {
          CardRenderer.renderTrickCard(document.getElementById(`trick-${pos}`), play.card);
        }
      });
    }
  },

  checkMarriageOptions(state) {
    const ma = document.getElementById('marriage-actions');
    if (!ma || !state) return;

    if (!state.marriageEligible) {
      ma.classList.add('hidden');
      return;
    }

    // Check which suits have both K and Q
    const hand = state.myHand || [];
    const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
    const validSuits = suits.filter(suit => {
      const hasKing = hand.some(c => c.rank === 'K' && c.suit === suit);
      const hasQueen = hand.some(c => c.rank === 'Q' && c.suit === suit);
      // Ensure we haven't already declared it
      const alreadyDeclared = state.marriages && state.marriages.some(m => m.seat === this.mySeat && m.suit === suit);
      return hasKing && hasQueen && !alreadyDeclared;
    });

    if (validSuits.length > 0) {
      const select = document.getElementById('marriage-suit-select');
      select.innerHTML = '';
      validSuits.forEach(suit => {
        const opt = document.createElement('option');
        opt.value = suit;
        opt.textContent = `${{ spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' }[suit] || suit}`;
        select.appendChild(opt);
      });
      ma.classList.remove('hidden');
    } else {
      ma.classList.add('hidden');
    }
  },

  playCard(card) {
    // Hide marriage actions immediately if they exist since we played
    const marriageActions = document.getElementById('marriage-actions');
    if (marriageActions) marriageActions.classList.add('hidden');

    SocketClient.emit('game:playCard', card.id, (res) => {
      if (!res.success) {
        Animations.showToast(res.error, 'error');
        // Restore if failed (though technically strict rule drops it, we can safely just ignore)
      }
    });
  },

  sendDeclareMarriage(suit) {
    SocketClient.emit('game:declareMarriage', suit, (res) => {
      if (!res.success) {
        Animations.showToast(res.error, 'error');
      } else {
        const marriageActions = document.getElementById('marriage-actions');
        if (marriageActions) marriageActions.classList.add('hidden');
      }
    });
  },

  // ============================================================
  // Turn Indicator
  // ============================================================
  updateTurnIndicator(state) {
    const indicator = document.getElementById('turn-indicator');
    const text = document.getElementById('turn-text');
    if (!indicator || !text) return;
    let currentTurn = null;

    switch (state.phase) {
      case 'VAKHAI':
        currentTurn = state.vakhai?.currentTurn;
        break;
      case 'BIDDING':
        currentTurn = state.bidding?.currentTurn;
        break;
      case 'HUKUM_SELECT':
      case 'PARTNER_SELECT':
        currentTurn = state.bidWinner;
        break;
      case 'TRICK_PLAY':
        currentTurn = state.trickPlay?.currentTurn;
        break;
    }

    // Clear all active-turn classes first
    document.querySelectorAll('.player-avatar').forEach(el => el.classList.remove('active-turn'));
    document.querySelectorAll('.my-player-avatar').forEach(el => el.classList.remove('active-turn'));

    if (currentTurn) {
      const pos = this.getSeatPosition(currentTurn);
      if (pos === 'bottom') {
        const myAv = document.getElementById('my-player-avatar');
        if (myAv) myAv.classList.add('active-turn');
      } else if (pos) {
        const opAv = document.getElementById(`avatar-${pos}`);
        if (opAv) opAv.classList.add('active-turn');
      }
    }

    if (currentTurn === this.mySeat) {
      indicator.classList.remove('hidden');
      indicator.classList.add('my-turn');
      let msg = '🎯 Your Turn!';
      if (state.phase === 'TRICK_PLAY' && state.trickPlay) {
        if (state.trickPlay.currentTrick?.length === 0) {
           msg = '🎯 You lead the trick!';
        } else if (state.trickPlay.leadSuit) {
           const hand = state.myHand || [];
           const leadSuit = state.trickPlay.leadSuit;
           const hasLeadSuit = hand.some(c => c.suit === leadSuit);
           if (hasLeadSuit) {
              const symbol = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' }[leadSuit];
              msg = `🎯 Follow suit ${symbol}!`;
           }
        }
      } else if (state.phase === 'HUKUM_SELECT') {
        msg = '🎯 Choose your trump suit!';
      } else if (state.phase === 'PARTNER_SELECT') {
        msg = '🎯 Choose your partner card!';
      } else if (state.phase === 'VAKHAI') {
        if (state.vakhai?.state === 'PLAYING') {
           if (state.vakhai.currentTrick?.length === 0) {
              msg = '🎯 You lead the Vakhai trick!';
           } else {
              msg = '🎯 Play higher suit if possible!';
           }
        } else {
           msg = '🎯 Your turn — Vakhai or Pass!';
        }
      } else if (state.phase === 'BIDDING') {
        msg = '🎯 Your turn to bid!';
      }
      text.textContent = msg;
      Animations.setActivePlayer('bottom');
    } else if (currentTurn) {
      indicator.classList.remove('hidden', 'my-turn');
      const name = this.getPlayerName(currentTurn);
      let msg = `⏳ ${name}'s Turn`;
      if (state.phase === 'TRICK_PLAY') {
         if (state.trickPlay?.currentTrick?.length === 0) {
            msg = `🎲 ${name} leads the trick`;
         } else {
            msg = `⏳ ${name}'s Turn`;
         }
      } else if (state.phase === 'HUKUM_SELECT') {
         msg = `⏳ ${name} is choosing trump...`;
      } else if (state.phase === 'PARTNER_SELECT') {
         msg = `⏳ ${name} is choosing partner card...`;
      } else if (state.phase === 'VAKHAI') {
         if (state.vakhai?.state === 'PLAYING') {
            msg = `⏳ ${name} is playing Vakhai...`;
         } else {
            msg = `⏳ ${name} — Vakhai or Pass?`;
         }
      } else if (state.phase === 'BIDDING') {
         msg = `⏳ ${name} is bidding...`;
      }
      text.textContent = msg;
      const pos = this.getSeatPosition(currentTurn);
      Animations.setActivePlayer(pos);
    } else {
      indicator.classList.add('hidden');
      indicator.classList.remove('my-turn');
      Animations.setActivePlayer(null);
    }
  },

  // ============================================================
  // Round End / Scoring
  // ============================================================
  onRoundEnd(data) {
    document.getElementById('phase-display').textContent = 'Round End';
    this.hideAllPanels();
    const ind = document.getElementById('turn-indicator');
    if (ind) { ind.classList.add('hidden'); ind.classList.remove('my-turn'); }

    const result = data.roundResult;
    this.updateScoreboard(data.scoring);

    const overlay = document.getElementById('round-result-overlay');
    const titleEl = document.getElementById('round-result-title');
    const content = document.getElementById('round-result-content');

    // Vakhai-only round
    if (result.isVakhaiRound) {
      const declName = this.getPlayerName(result.vakhaiDeclarer);
      if (result.vakhaiDefeated) {
        titleEl.textContent = `❌ Vakhai Failed — ${declName} lost!`;
      } else {
        titleEl.textContent = `✅ Vakhai Won — ${declName} wins!`;
      }

      let html = `<div class="round-meta">`;
      html += `<div class="round-meta-chip">Vakhai by <strong>${declName}</strong></div>`;
      html += `<div class="round-meta-chip">Stake: <strong>${result.vakhaiStake} marks</strong></div>`;
      if (result.vakhaiDefeated) {
        html += `<div class="round-meta-chip" style="color:var(--error)">Each other player gets +${result.vakhaiStake} marks</div>`;
      } else {
        html += `<div class="round-meta-chip" style="color:var(--success)">${declName} gets +${result.vakhaiStake} marks</div>`;
      }
      html += `</div>`;

      html += '<table class="score-table"><thead><tr><th>Player</th><th>This Round</th><th>Total</th></tr></thead><tbody>';
      for (let s = 1; s <= 4; s++) {
        const name = this.getPlayerName(s);
        const rm = result.roundMarks ? (result.roundMarks[s] || 0) : 0;
        const tm = result.totalMarks ? (result.totalMarks[s] || 0) : 0;
        const rmClass = rm > 0 ? 'score-positive' : rm < 0 ? 'score-negative' : '';
        html += `<tr><td>${name}</td><td class="${rmClass}">${rm > 0 ? '+' : ''}${rm}</td><td><strong>${tm}</strong></td></tr>`;
      }
      html += '</tbody></table>';
      content.innerHTML = html;
      overlay.classList.remove('hidden');
      return;
    }

    // Normal bid round
    titleEl.textContent = result.bidSuccess ? '✅ Bid Successful!' : '❌ Bid Failed!';

    const bidderName = this.getPlayerName(result.bidderSeat);
    const finalTarget = data.roundResult.finalTarget ?? result.bidAmount;
    const origBid = result.bidAmount;

    let html = `<div class="round-meta">`;
    html += `<div class="round-meta-chip">Bid by <strong>${bidderName}</strong></div>`;
    html += `<div class="round-meta-chip">Original bid: <strong>${origBid}</strong></div>`;
    if (finalTarget !== origBid) {
      html += `<div class="round-meta-chip">Adjusted target: <strong style="color:var(--gold)">${finalTarget}</strong></div>`;
    }
    html += `<div class="round-meta-chip">Bidder pts: <strong>${result.bidderTeamPoints}</strong> | Opp pts: <strong>${result.opponentTeamPoints}</strong></div>`;
    html += `</div>`;

    html += '<table class="score-table"><thead><tr><th>Player</th><th>Round</th><th>Total</th></tr></thead><tbody>';
    for (let s = 1; s <= 4; s++) {
      const name = this.getPlayerName(s);
      const rm = result.roundMarks[s];
      const tm = result.totalMarks[s];
      const rmClass = rm > 0 ? 'score-positive' : rm < 0 ? 'score-negative' : '';
      html += `<tr><td>${name}</td><td class="${rmClass}">${rm > 0 ? '+' : ''}${rm}</td><td><strong>${tm}</strong></td></tr>`;
    }
    html += '</tbody></table>';
    content.innerHTML = html;
    overlay.classList.remove('hidden');
  },

  sendNextRound() {
    const btn = document.getElementById('btn-next-round');
    if (btn) btn.disabled = true;
    
    this.handSorted = false;
    this.partnerMessageShown = false;
    SocketClient.emit('game:nextRound', null, (res) => {
      if (!res.success) {
        Animations.showToast(res.error || 'Could not start next round', 'error');
        if (btn) btn.disabled = false;
      }
    });
  },

  onRoundReadyState(data) {
    const btnContainer = document.getElementById('btn-next-round')?.parentNode;
    if (btnContainer) {
      let statusEl = document.getElementById('round-ready-status');
      if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.id = 'round-ready-status';
        statusEl.style.marginTop = '10px';
        statusEl.style.color = 'var(--gold)';
        statusEl.style.fontSize = '0.9rem';
        btnContainer.appendChild(statusEl);
      }
      statusEl.textContent = `Waiting for players... (${data.readyCount}/4 ready)`;
      
      if (data.readyCount === 4) {
        document.getElementById('round-result-overlay').classList.add('hidden');
        if (statusEl) statusEl.remove();
        const btn = document.getElementById('btn-next-round');
        if (btn) btn.disabled = false;
      }
    }
  },

  // ============================================================
  // Scoreboard
  // ============================================================
  updateScoreboard(scoring) {
    const tbody = document.getElementById('score-table-body');
    if (!scoring) return;

    let html = '';
    for (let s = 1; s <= 4; s++) {
      const name = this.getPlayerName(s);
      const total = scoring.totalMarks[s] || 0;
      const lastRound = scoring.roundHistory.length > 0
        ? scoring.roundHistory[scoring.roundHistory.length - 1].roundMarks[s] || 0
        : '-';
      html += `<tr><td>${name}</td><td>${lastRound}</td><td><strong>${total}</strong></td></tr>`;
    }
    tbody.innerHTML = html;

    const histContent = document.getElementById('history-content');
    histContent.innerHTML = scoring.roundHistory.map(r => `
      <div class="history-item">
        <div class="history-item-header">Round ${r.roundNumber}</div>
        <p>Bid: ${r.bidAmount} by Seat ${r.bidderSeat} — ${r.bidSuccess ? '✅ Success' : '❌ Failed'}</p>
        <p>Team pts: ${r.bidderTeamPoints} vs ${r.opponentTeamPoints}</p>
      </div>
    `).join('');
  },

  // ============================================================
  // Helpers
  // ============================================================
  getPlayerName(seat) {
    if (!this.roomState?.seats) return `Seat ${seat}`;
    const player = this.roomState.seats[seat];
    return player?.displayName || `Seat ${seat}`;
  },

  showPanel(panelName) {
    const actionPanel = document.getElementById('action-panel');
    actionPanel.classList.remove('hidden');
    this.hideAllSections();
    document.getElementById(`${panelName}-panel`).classList.remove('hidden');
  },

  hideAllPanels() {
    document.getElementById('action-panel').classList.add('hidden');
    this.hideAllSections();
  },

  hideAllSections() {
    ['vakhai', 'bidding', 'hukum', 'partner', 'trickplay'].forEach(id => {
      const el = document.getElementById(`${id}-panel`);
      if (el) el.classList.add('hidden');
    });
  }
};

window.GameUI = GameUI;
