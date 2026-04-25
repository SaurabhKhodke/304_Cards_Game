// ============================================================
// Vakhai Phase - Challenge mini-round (first 4 cards only)
// ============================================================
// STATE MACHINE:
//   DECLARING  → each player in turn order declares 3, 5, or passes
//   PLAYING    → only if exactly one declared; declarer leads 4 tricks
//   RESOLVED   → terminal; results are populated
// ============================================================

class VakhaiPhase {
  constructor() {
    // === Declaring state ===
    this.state = 'DECLARING';
    this.declarations = {}; // seatNumber → { stake, declared }
    this.vakhaiDeclarer = null;
    this.vakhaiStake = 0;

    // Turn tracking (used in both DECLARING and PLAYING)
    this.turnOrder = [];
    this.currentTurn = null;
    this.actionsCount = 0; // how many players have declared/passed

    // === Playing state ===
    this.leadSuit = null;
    this.currentTrick = [];
    this.trickHistory = [];
    this.trickCount = 0;     // tricks completed in PLAYING phase
    this.tricksWon = { 1: 0, 2: 0, 3: 0, 4: 0 };
    this.vakhaiDefeated = false;

    // === Terminal state ===
    this.completed = false;
    this.results = [];
  }

  // ------------------------------------------------------------------
  // Initialization
  // ------------------------------------------------------------------

  /** Must be called once before any actions. startSeat = seat left of dealer. */
  initialize(startSeat) {
    this._buildTurnOrder(startSeat);
    this.currentTurn = this.turnOrder[0];
    this.declarations = {};
    this.actionsCount = 0;
  }

  _buildTurnOrder(startSeat) {
    this.turnOrder = [];
    for (let i = 0; i < 4; i++) {
      this.turnOrder.push(((startSeat - 1 + i) % 4) + 1);
    }
  }

  // ------------------------------------------------------------------
  // DECLARING phase actions
  // ------------------------------------------------------------------

  /**
   * Declare vakhai with a stake of 3 or 5.
   * Only the first declaration is accepted; subsequent declarers get rejected.
   */
  declare(seatNumber, stake) {
    if (this.state !== 'DECLARING') {
      return { success: false, error: 'Not in declaring phase' };
    }
    if (seatNumber !== this.currentTurn) {
      return { success: false, error: 'Not your turn' };
    }
    if (stake !== 3 && stake !== 5) {
      return { success: false, error: 'Stake must be 3 or 5' };
    }
    if (this.vakhaiDeclarer !== null) {
      // Someone already declared — this player must pass
      return { success: false, error: 'Vakhai already declared by another player; you must pass' };
    }

    this.declarations[seatNumber] = { stake, declared: true };
    this.vakhaiDeclarer = seatNumber;
    this.vakhaiStake = stake;
    this._advanceDeclaring();
    return { success: true };
  }

  /** Pass on vakhai. */
  pass(seatNumber) {
    if (this.state !== 'DECLARING') {
      return { success: false, error: 'Not in declaring phase' };
    }
    if (seatNumber !== this.currentTurn) {
      return { success: false, error: 'Not your turn' };
    }

    this.declarations[seatNumber] = { stake: 0, declared: false };
    this._advanceDeclaring();
    return { success: true };
  }

  _advanceDeclaring() {
    this.actionsCount++;

    if (this.actionsCount < 4) {
      // Move to next player in turn order
      this.currentTurn = this.turnOrder[this.actionsCount];
      return;
    }

    // All 4 players have acted — resolve declaring phase
    if (this.vakhaiDeclarer !== null) {
      // Transition to PLAYING: declarer leads
      this.state = 'PLAYING';
      this._buildTurnOrder(this.vakhaiDeclarer);
      this.currentTurn = this.vakhaiDeclarer;
      this.leadSuit = null;
      this.currentTrick = [];
    } else {
      // No one declared — Vakhai skipped, proceed to normal game
      this.state = 'RESOLVED';
      this.completed = true;
      this.results = []; // empty = no vakhai happened
    }
  }

  // ------------------------------------------------------------------
  // PLAYING phase actions
  // ------------------------------------------------------------------

  /**
   * Validate a card play against Vakhai rules:
   *   1. Must follow lead suit if possible.
   *   2. Must play a higher card of lead suit if possible.
   */
  validatePlay(card, hand) {
    // Leading the trick — always valid
    if (this.currentTrick.length === 0) return true;

    const hasLeadSuit = hand.some(c => c.suit === this.leadSuit);
    if (!hasLeadSuit) return true; // Can dump any card

    if (card.suit !== this.leadSuit) {
      return 'You must follow the lead suit.';
    }

    // Find highest lead-suit strength already in the trick
    let highestInTrick = -1;
    for (const p of this.currentTrick) {
      if (p.card.suit === this.leadSuit && p.card.strength > highestInTrick) {
        highestInTrick = p.card.strength;
      }
    }

    // Check if player has a stronger card of the lead suit
    const canBeat = hand.some(c => c.suit === this.leadSuit && c.strength > highestInTrick);
    if (canBeat && card.strength <= highestInTrick) {
      return 'You must play a higher value card of the lead suit since you have one.';
    }

    return true;
  }

  /**
   * Play a card during the PLAYING phase.
   * Returns { success, trickComplete, trickResult, vakhaiComplete, vakhaiDefeated }
   */
  playCard(seatNumber, cardObj, playerHand) {
    if (this.state !== 'PLAYING') {
      return { success: false, error: 'Vakhai is not in playing phase' };
    }
    if (this.completed) {
      return { success: false, error: 'Vakhai already completed' };
    }
    if (seatNumber !== this.currentTurn) {
      return { success: false, error: 'Not your turn' };
    }

    const validation = this.validatePlay(cardObj, playerHand);
    if (validation !== true) {
      return { success: false, error: validation };
    }

    // Record lead suit on first card of trick
    if (this.currentTrick.length === 0) {
      this.leadSuit = cardObj.suit;
    }

    this.currentTrick.push({ seat: seatNumber, card: cardObj });

    if (this.currentTrick.length === 4) {
      return this._completeTrick();
    }

    // Advance turn within trick
    const idx = this.turnOrder.indexOf(seatNumber);
    this.currentTurn = this.turnOrder[(idx + 1) % 4];
    return { success: true, trickComplete: false };
  }

  _completeTrick() {
    // Winner = highest card of lead suit (no trump in vakhai)
    let winnerPlay = this.currentTrick[0];
    for (let i = 1; i < this.currentTrick.length; i++) {
      const p = this.currentTrick[i];
      if (p.card.suit === this.leadSuit && p.card.strength > winnerPlay.card.strength) {
        winnerPlay = p;
      }
    }
    // Edge case: if leader's card wasn't kept (shouldn't happen but guard it)
    if (winnerPlay.card.suit !== this.leadSuit) {
      winnerPlay = this.currentTrick[0]; // fallback to lead
    }

    const winningSeat = winnerPlay.seat;

    // Archive trick
    this.trickHistory.push({
      trickNumber: this.trickCount + 1,
      cards: this.currentTrick.map(p => ({ seat: p.seat, card: p.card })),
      winner: winningSeat,
      leadSuit: this.leadSuit
    });
    this.tricksWon[winningSeat] = (this.tricksWon[winningSeat] || 0) + 1;
    this.trickCount++;

    const trickResult = {
      winningSeat,
      winningCard: winnerPlay.card,
      trickNumber: this.trickCount
    };

    // ── CRITICAL: Check loss IMMEDIATELY ──────────────────────────────
    if (winningSeat !== this.vakhaiDeclarer) {
      // Declarer lost — terminate Vakhai NOW, don't play remaining tricks
      this.vakhaiDefeated = true;
      this.state = 'RESOLVED';
      this.completed = true;
      this.results = this._resolveResults();
      return {
        success: true,
        trickComplete: true,
        trickResult,
        vakhaiComplete: true,
        vakhaiDefeated: true
      };
    }

    // Declarer won this trick
    if (this.trickCount === 4) {
      // Won all 4 tricks — success
      this.state = 'RESOLVED';
      this.completed = true;
      this.results = this._resolveResults();
      return {
        success: true,
        trickComplete: true,
        trickResult,
        vakhaiComplete: true,
        vakhaiDefeated: false
      };
    }

    // More tricks remain — reset for next trick, winner leads
    this.currentTrick = [];
    this.leadSuit = null;
    this._buildTurnOrder(winningSeat);
    this.currentTurn = winningSeat;
    return { success: true, trickComplete: true, trickResult, vakhaiComplete: false };
  }

  // ------------------------------------------------------------------
  // Scoring
  // ------------------------------------------------------------------

  _resolveResults() {
    if (this.vakhaiDeclarer === null) return [];

    const stake = this.vakhaiStake;
    const won = !this.vakhaiDefeated;
    const results = [];

    if (won) {
      // Declarer gets +stake
      results.push({ seat: this.vakhaiDeclarer, stake, won: true, marks: stake });
    } else {
      // Declarer gets 0 (or we track it as 0 for that round)
      results.push({ seat: this.vakhaiDeclarer, stake, won: false, marks: 0 });
      // Each of the other 3 players gets +stake
      for (let i = 1; i <= 4; i++) {
        if (i !== this.vakhaiDeclarer) {
          results.push({ seat: i, stake, won: true, marks: stake, fromChallenge: this.vakhaiDeclarer });
        }
      }
    }
    return results;
  }

  // Public alias used by GameEngine
  resolveVakhai() {
    return this._resolveResults();
  }

  // ------------------------------------------------------------------
  // State snapshot
  // ------------------------------------------------------------------

  getState() {
    return {
      state: this.state,           // 'DECLARING' | 'PLAYING' | 'RESOLVED'
      currentTurn: this.currentTurn,
      actionsCount: this.actionsCount,
      declarations: this.declarations,
      vakhaiDeclarer: this.vakhaiDeclarer,
      vakhaiStake: this.vakhaiStake,
      completed: this.completed,
      results: this.results,
      leadSuit: this.leadSuit,
      currentTrick: this.currentTrick,
      trickCount: this.trickCount,
      tricksWon: this.tricksWon,
      vakhaiDefeated: this.vakhaiDefeated,
      trickHistory: this.trickHistory
    };
  }
}

module.exports = { VakhaiPhase };
