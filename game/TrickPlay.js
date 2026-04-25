// ============================================================
// Trick Play Engine - Manages card play in tricks
// ============================================================

const { determineTrickWinner } = require('./Deck');

class TrickPlay {
  constructor() {
    this.trumpSuit = null;       // Hukum suit
    this.partnerCard = null;     // Partner card id
    this.partnerSeat = null;     // Seat holding partner card (hidden until played)
    this.partnerRevealed = false;
    this.bidderSeat = null;      // Seat of the bidder
    
    this.currentTrick = [];      // [{seat, card}, ...] cards played in current trick
    this.trickNumber = 0;        // Current trick (1-8)
    this.currentTurn = null;     // Seat whose turn it is
    this.turnOrder = [];         // Clockwise order for current trick
    this.leadSuit = null;        // Suit led in current trick
    
    this.tricksWon = { 1: [], 2: [], 3: [], 4: [] }; // Cards won by each seat
    this.trickHistory = [];      // History of all tricks
    this.completed = false;
    this.partnerKilled = false;  // Teams change if partner killed
    this.partnerKilledInThisTrick = false; 
  }

  /**
   * Initialize trick play
   * @param {number} startSeat - seat that leads the first trick
   * @param {string} trumpSuit - hukum suit
   * @param {string} partnerCardId - partner card identifier (e.g. "A_spades")
   * @param {number} bidderSeat - the bidder's seat
   * @param {Object} hands - all players' hands to find partner
   */
  initialize(startSeat, trumpSuit, partnerCardId, bidderSeat, hands) {
    this.trumpSuit = trumpSuit;
    this.partnerCard = partnerCardId;
    this.bidderSeat = bidderSeat;
    this.partnerRevealed = false;
    this.trickNumber = 1;
    this.currentTrick = [];
    this.trickHistory = [];
    this.tricksWon = { 1: [], 2: [], 3: [], 4: [] };
    this.partnerKilled = false;
    this.partnerKilledInThisTrick = false;
    this.partnerCalledOut = false;
    this.partnerRevealedInThisTrick = false;

    // Find who holds the partner card
    this.partnerSeat = null;
    for (let seat = 1; seat <= 4; seat++) {
      if (hands[seat].some(c => c.id === partnerCardId)) {
        this.partnerSeat = seat;
        break;
      }
    }

    // Set up turn order starting from startSeat
    this.setTurnOrder(startSeat);
    this.currentTurn = startSeat;
    this.leadSuit = null;
  }

  /**
   * Set clockwise turn order starting from a given seat
   */
  setTurnOrder(startSeat) {
    this.turnOrder = [];
    for (let i = 0; i < 4; i++) {
      this.turnOrder.push(((startSeat - 1 + i) % 4) + 1);
    }
  }

  /**
   * Play a card in the current trick
   * @param {number} seatNumber - player's seat
   * @param {object} card - the card being played
   * @param {Array} playerHand - player's current hand (for validation)
   * @returns {object} { success, error?, trickComplete?, trickResult? }
   */
  playCard(seatNumber, card, playerHand) {
    // Validate it's the player's turn
    if (seatNumber !== this.currentTurn) {
      return { success: false, error: 'Not your turn' };
    }

    // Validate card is in player's hand
    if (!playerHand.some(c => c.id === card.id)) {
      return { success: false, error: 'Card not in your hand' };
    }

    // Validate follow-suit rule based ONLY on leadSuit
    if (this.currentTrick.length > 0 && this.leadSuit) {
      const hasLeadSuit = playerHand.some(c => c.suit === this.leadSuit);
      if (hasLeadSuit && card.suit !== this.leadSuit) {
        return { success: false, error: `You must follow suit (${this.leadSuit})` };
      }
    }

    // Set lead suit ONLY on the very first card of the trick
    // Do NOT overwrite leadSuit after first card
    if (this.currentTrick.length === 0) {
      this.leadSuit = card.suit;
    }

    // Play the card
    this.currentTrick.push({ seat: seatNumber, card });

    // Check if trick is complete (4 cards played)
    if (this.currentTrick.length === 4) {
      return this.completeTrick();
    }

    // Advance to next player
    const currentIndex = this.turnOrder.indexOf(seatNumber);
    this.currentTurn = this.turnOrder[(currentIndex + 1) % 4];

    return { success: true, trickComplete: false };
  }

  /**
   * Complete the current trick and determine winner
   */
  completeTrick() {
    const result = determineTrickWinner(this.currentTrick, this.trumpSuit);
    
    // Add trick cards to winner's collection
    for (const play of this.currentTrick) {
      this.tricksWon[result.winningSeat].push(play.card);
    }

    // Save trick history
    this.trickHistory.push({
      trickNumber: this.trickNumber,
      cards: [...this.currentTrick],
      winner: result.winningSeat,
      points: result.points,
      leadSuit: this.leadSuit
    });

    this.partnerKilledInThisTrick = false;
    this.partnerRevealedInThisTrick = false;
    const partnerCardPlay = this.currentTrick.find(p => p.card.id === this.partnerCard);

    if (partnerCardPlay && !this.partnerRevealed) {
      this.partnerRevealed = true;
      this.partnerRevealedInThisTrick = true;
    }

    // Feature 2: Partner Kill Mechanic
    if (partnerCardPlay && !this.partnerKilled && this.trumpSuit) {
      const pSuit = partnerCardPlay.card.suit;
      const wCard = result.winningCard;
      // Condition: Lead suit == partner suit. Partner card suit !== trump. Winning card is Trump.
      if (this.leadSuit === pSuit && pSuit !== this.trumpSuit && wCard.suit === this.trumpSuit) {
        this.partnerKilled = true;
        this.partnerKilledInThisTrick = true;
      }
    }

    this.trickNumber++;

    // Check if all 8 tricks are done
    if (this.trickNumber > 8) {
      this.completed = true;
      return {
        success: true,
        trickComplete: true,
        trickResult: result,
        roundComplete: true
      };
    }

    // Set up next trick - winner leads
    this.currentTrick = [];
    this.leadSuit = null;
    this.setTurnOrder(result.winningSeat);
    this.currentTurn = result.winningSeat;

    return {
      success: true,
      trickComplete: true,
      trickResult: result,
      roundComplete: false
    };
  }

  /**
   * Force reveal the partner (Called Out for trick)
   */
  forceReveal() {
    if (!this.partnerCalledOut && !this.partnerRevealed) {
      this.partnerCalledOut = true;
      return true;
    }
    return false;
  }

  /**
   * Calculate points for each team
   * @returns {object} { bidderTeam: points, opponentTeam: points }
   */
  calculateTeamPoints() {
    let bidderTeamPoints = 0;
    let opponentTeamPoints = 0;

    for (let seat = 1; seat <= 4; seat++) {
      const seatPoints = this.tricksWon[seat].reduce((sum, card) => sum + card.points, 0);
      if (seat === this.bidderSeat || (!this.partnerKilled && seat === this.partnerSeat)) {
        bidderTeamPoints += seatPoints;
      } else {
        opponentTeamPoints += seatPoints;
      }
    }

    return { bidderTeamPoints, opponentTeamPoints };
  }

  /**
   * Get public state (hides partner until revealed)
   */
  getState(forSeat = null) {
    return {
      trumpSuit: this.trumpSuit,
      partnerCard: this.partnerCard,
      partnerSeat: this.partnerRevealed ? this.partnerSeat : null,
      partnerRevealed: this.partnerRevealed,
      bidderSeat: this.bidderSeat,
      currentTrick: this.currentTrick.map(p => ({
        seat: p.seat,
        card: p.card
      })),
      trickNumber: this.trickNumber,
      currentTurn: this.currentTurn,
      leadSuit: this.leadSuit,
      trickHistory: this.trickHistory,
      completed: this.completed,
      partnerKilled: this.partnerKilled,
      partnerCalledOut: this.partnerCalledOut,
      // Show own partner status to bidder
      isPartner: forSeat === this.partnerSeat,
      isBidder: forSeat === this.bidderSeat
    };
  }
}

module.exports = { TrickPlay };
