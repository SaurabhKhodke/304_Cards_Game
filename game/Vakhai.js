// ============================================================
// Vakhai Phase - Challenge phase after first 4 cards
// ============================================================
// Vakhai rules are configurable. The default compares hands by
// total point value of the first 4 cards.

const { calculatePoints } = require('./Deck');

/**
 * Available vakhai comparison rules
 * Each rule is a function: (hand4cards) => number (higher = better)
 */
const VAKHAI_RULES = {
  // Default: total point value of 4 cards
  points: (cards) => calculatePoints(cards),

  // Alternative: count of high-value cards (J, 9, A)
  highCards: (cards) => {
    return cards.filter(c => ['J', '9', 'A'].includes(c.rank)).length * 100
      + calculatePoints(cards);
  },

  // Alternative: all same suit bonus
  suitBonus: (cards) => {
    const suits = new Set(cards.map(c => c.suit));
    const baseScore = calculatePoints(cards);
    // Bonus if all 4 cards are same suit
    if (suits.size === 1) return baseScore + 200;
    if (suits.size === 2) return baseScore + 50;
    return baseScore;
  }
};

class VakhaiPhase {
  constructor(compareRule = 'points') {
    this.compareRule = compareRule;
    this.declarations = {};    // { seatNumber: { stake, declared: true/false } }
    this.results = [];         // Results after resolution
    this.completed = false;
    this.currentTurn = null;   // Current player to decide
    this.turnOrder = [];       // Clockwise order
  }

  /**
   * Initialize vakhai phase
   * @param {number} startSeat - seat that goes first
   */
  initialize(startSeat) {
    this.turnOrder = [];
    for (let i = 0; i < 4; i++) {
      this.turnOrder.push(((startSeat - 1 + i) % 4) + 1);
    }
    this.currentTurn = this.turnOrder[0];
    this.declarations = {};
  }

  /**
   * Player declares vakhai with a stake
   */
  declare(seatNumber, stake) {
    if (seatNumber !== this.currentTurn) {
      return { success: false, error: 'Not your turn' };
    }
    if (stake < 1) {
      return { success: false, error: 'Invalid stake' };
    }
    this.declarations[seatNumber] = { stake, declared: true };
    this.advanceTurn();
    return { success: true };
  }

  /**
   * Player passes on vakhai
   */
  pass(seatNumber) {
    if (seatNumber !== this.currentTurn) {
      return { success: false, error: 'Not your turn' };
    }
    this.declarations[seatNumber] = { stake: 0, declared: false };
    this.advanceTurn();
    return { success: true };
  }

  /**
   * Advance to next player's turn
   */
  advanceTurn() {
    const currentIndex = this.turnOrder.indexOf(this.currentTurn);
    if (currentIndex < this.turnOrder.length - 1) {
      this.currentTurn = this.turnOrder[currentIndex + 1];
    } else {
      this.currentTurn = null; // All players have acted
      this.completed = true;
    }
  }

  /**
   * Check if any player declared vakhai
   */
  hasDeclarations() {
    return Object.values(this.declarations).some(d => d.declared);
  }

  /**
   * Resolve vakhai challenges
   * @param {Object} hands - { seatNumber: [4 cards] }
   * @returns {Array} results - [{ seat, stake, won, marks }]
   */
  resolve(hands) {
    if (!this.hasDeclarations()) {
      return []; // No vakhai declared
    }

    const ruleFn = VAKHAI_RULES[this.compareRule] || VAKHAI_RULES.points;
    const results = [];

    // Calculate hand scores for all players
    const scores = {};
    for (let seat = 1; seat <= 4; seat++) {
      scores[seat] = ruleFn(hands[seat]);
    }

    // For each declaration, compare against all other players
    for (const [seatStr, decl] of Object.entries(this.declarations)) {
      if (!decl.declared) continue;
      const seat = parseInt(seatStr);
      const declarerScore = scores[seat];
      
      // Declarer wins if they have the highest score among all players
      let won = true;
      for (let otherSeat = 1; otherSeat <= 4; otherSeat++) {
        if (otherSeat === seat) continue;
        if (scores[otherSeat] >= declarerScore) {
          won = false;
          break;
        }
      }

      if (won) {
        // Declarer wins: gets the declared marks
        results.push({ seat, stake: decl.stake, won: true, marks: decl.stake });
      } else {
        // Declarer loses: other 3 players each get the declared marks
        results.push({ seat, stake: decl.stake, won: false, marks: -decl.stake });
        // Other players each get the stake
        for (let otherSeat = 1; otherSeat <= 4; otherSeat++) {
          if (otherSeat !== seat) {
            results.push({
              seat: otherSeat,
              stake: decl.stake,
              won: true,
              marks: decl.stake,
              fromChallenge: seat
            });
          }
        }
      }
    }

    this.results = results;
    return results;
  }

  /**
   * Get current state for clients
   */
  getState() {
    return {
      currentTurn: this.currentTurn,
      declarations: this.declarations,
      completed: this.completed,
      results: this.results
    };
  }
}

module.exports = { VakhaiPhase, VAKHAI_RULES };
