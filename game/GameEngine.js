// ============================================================
// Game Engine - Main State Machine
// ============================================================
// Manages the full lifecycle of a 304 game round:
// LOBBY → DEALING_FIRST → VAKHAI → DEALING_SECOND → BIDDING →
// HUKUM_SELECT → PARTNER_SELECT → TRICK_PLAY → ROUND_END

const { createDeck, shuffleDeck, dealCards, sortHand } = require('./Deck');
const { VakhaiPhase } = require('./Vakhai');
const { BiddingPhase } = require('./Bidding');
const { TrickPlay } = require('./TrickPlay');
const { Scoring } = require('./Scoring');

// Game phases
const PHASES = {
  LOBBY: 'LOBBY',
  DEALING_FIRST: 'DEALING_FIRST',
  VAKHAI: 'VAKHAI',
  DEALING_SECOND: 'DEALING_SECOND',
  BIDDING: 'BIDDING',
  HUKUM_SELECT: 'HUKUM_SELECT',
  PARTNER_SELECT: 'PARTNER_SELECT',
  TRICK_PLAY: 'TRICK_PLAY',
  ROUND_END: 'ROUND_END',
  GAME_OVER: 'GAME_OVER'
};

class GameEngine {
  constructor(room) {
    this.room = room;
    this.phase = PHASES.LOBBY;
    this.roundNumber = 0;
    this.dealerSeat = 1;  // Rotates clockwise each round
    
    // Per-round state
    this.deck = [];
    this.hands = { 1: [], 2: [], 3: [], 4: [] };
    this.firstHands = { 1: [], 2: [], 3: [], 4: [] }; // For vakhai comparison
    
    // Phase handlers
    this.vakhai = null;
    this.bidding = null;
    this.trickPlay = null;
    this.scoring = new Scoring();
    
    // Round-specific
    this.hukumSuit = null;
    this.partnerCard = null;
    this.bidWinner = null;
    this.bidAmount = 0;
    
    // Vakhai results for current round
    this.currentVakhaiResults = [];
    
    // Marriage and Target Tracking
    this.targetScore = 0;
    this.marriages = [];
    this.firstTrickWonAt = { 1: null, 2: null, 3: null, 4: null };
    this.marriageEligible = { 1: false, 2: false, 3: false, 4: false };
  }

  // ============================================================
  // Phase: Start New Round
  // ============================================================
  startRound() {
    this.roundNumber++;
    this.phase = PHASES.DEALING_FIRST;
    if (this.roundNumber > 1) {
      this.dealerSeat = (this.dealerSeat % 4) + 1;
    }
    
    // Reset per-round state
    this.hukumSuit = null;
    this.partnerCard = null;
    this.bidWinner = null;
    this.bidAmount = 0;
    this.targetScore = 0;
    this.currentVakhaiResults = [];
    this.marriages = [];
    this.firstTrickWonAt = { 1: null, 2: null, 3: null, 4: null };
    this.marriageEligible = { 1: false, 2: false, 3: false, 4: false };
    
    this.hands = { 1: [], 2: [], 3: [], 4: [] };
    this.firstHands = { 1: [], 2: [], 3: [], 4: [] };

    // Create and shuffle deck
    this.deck = shuffleDeck(createDeck());

    // Deal first 4 cards to each player (clockwise from next after dealer)
    const firstDealSeat = (this.dealerSeat % 4) + 1;
    const { hands: firstHands, remainingDeck } = dealCards(this.deck, firstDealSeat, 4);
    
    // Store first hands (for vakhai) and current hands
    for (let s = 1; s <= 4; s++) {
      this.firstHands[s] = [...firstHands[s]];
      this.hands[s] = [...firstHands[s]];
    }
    this.deck = remainingDeck;

    return {
      phase: this.phase,
      dealerSeat: this.dealerSeat,
      roundNumber: this.roundNumber,
      hands: this.hands
    };
  }

  // ============================================================
  // Phase: Vakhai
  // ============================================================
  startVakhai() {
    this.phase = PHASES.VAKHAI;
    const startSeat = (this.dealerSeat % 4) + 1;
    this.vakhai = new VakhaiPhase(this.room.settings.vakhaiCompareRule);
    this.vakhai.initialize(startSeat);
    return this.vakhai.getState();
  }

  handleVakhaiAction(seatNumber, action, stake) {
    if (this.phase !== PHASES.VAKHAI) {
      return { success: false, error: 'Not in vakhai phase' };
    }

    let result;
    if (action === 'declare') {
      result = this.vakhai.declare(seatNumber, stake);
    } else {
      result = this.vakhai.pass(seatNumber);
    }

    if (!result.success) return result;

    // If vakhai phase is complete, resolve it
    if (this.vakhai.completed) {
      this.currentVakhaiResults = this.vakhai.resolve(this.firstHands);
    }

    return {
      success: true,
      state: this.vakhai.getState(),
      completed: this.vakhai.completed,
      results: this.vakhai.completed ? this.currentVakhaiResults : null
    };
  }

  // ============================================================
  // Phase: Deal Second Hand
  // ============================================================
  dealSecondHand() {
    this.phase = PHASES.DEALING_SECOND;
    
    const firstDealSeat = (this.dealerSeat % 4) + 1;
    const { hands: secondHands } = dealCards(this.deck, firstDealSeat, 4);
    
    // Add second set of cards to existing hands
    for (let s = 1; s <= 4; s++) {
      this.hands[s] = [...this.hands[s], ...secondHands[s]];
    }
    this.deck = [];

    return { hands: this.hands };
  }

  // ============================================================
  // Phase: Bidding
  // ============================================================
  startBidding() {
    this.phase = PHASES.BIDDING;
    const startSeat = (this.dealerSeat % 4) + 1;
    this.bidding = new BiddingPhase();
    this.bidding.initialize(startSeat);
    return this.bidding.getState();
  }

  handleBid(seatNumber, action, amount) {
    if (this.phase !== PHASES.BIDDING) {
      return { success: false, error: 'Not in bidding phase' };
    }

    let result;
    if (action === 'bid') {
      result = this.bidding.placeBid(seatNumber, amount);
    } else {
      result = this.bidding.passBid(seatNumber);
    }

    if (!result.success) return result;

    // If bidding is complete, store winner
    if (this.bidding.completed) {
      this.bidWinner = this.bidding.winner.seat;
      this.bidAmount = this.bidding.winner.bid;
    }

    return {
      success: true,
      state: this.bidding.getState(),
      completed: this.bidding.completed,
      winner: this.bidding.completed ? this.bidding.winner : null
    };
  }

  // ============================================================
  // Phase: Hukum Selection
  // ============================================================
  startHukumSelect() {
    this.phase = PHASES.HUKUM_SELECT;
    return { phase: this.phase, bidWinner: this.bidWinner };
  }

  selectHukum(seatNumber, suit) {
    if (this.phase !== PHASES.HUKUM_SELECT) {
      return { success: false, error: 'Not in hukum selection phase' };
    }
    if (seatNumber !== this.bidWinner) {
      return { success: false, error: 'Only the bid winner can select hukum' };
    }
    const validSuits = ['spades', 'hearts', 'diamonds', 'clubs'];
    if (!validSuits.includes(suit)) {
      return { success: false, error: 'Invalid suit' };
    }

    this.hukumSuit = suit;
    this.phase = PHASES.PARTNER_SELECT;
    return { success: true, hukumSuit: suit };
  }

  // ============================================================
  // Phase: Partner Card Selection
  // ============================================================
  selectPartner(seatNumber, cardId) {
    if (this.phase !== PHASES.PARTNER_SELECT) {
      return { success: false, error: 'Not in partner selection phase' };
    }
    if (seatNumber !== this.bidWinner) {
      return { success: false, error: 'Only the bid winner can select partner card' };
    }

    // Validate card exists in the deck
    const allCards = [];
    for (let s = 1; s <= 4; s++) {
      allCards.push(...this.hands[s]);
    }
    const cardExists = allCards.some(c => c.id === cardId);
    if (!cardExists) {
      return { success: false, error: 'Invalid card selection' };
    }

    // Bidder cannot select a card they already hold
    const bidderOwnsCard = this.hands[seatNumber].some(c => c.id === cardId);
    if (bidderOwnsCard) {
      return { success: false, error: 'Invalid partner card selection. You cannot select a card you already hold.' };
    }

    this.partnerCard = cardId;
    return { success: true, partnerCard: cardId };
  }

  // ============================================================
  // Phase: Trick Play
  // ============================================================
  startTrickPlay() {
    this.phase = PHASES.TRICK_PLAY;
    const startSeat = this.bidWinner; // Bid winner leads the first trick
    this.trickPlay = new TrickPlay();
    this.trickPlay.initialize(
      startSeat,
      this.hukumSuit,
      this.partnerCard,
      this.bidWinner,
      this.hands
    );
    this.targetScore = this.bidAmount; // target starts at base bid
    return this.trickPlay.getState();
  }

  handleCardPlay(seatNumber, cardId) {
    if (this.phase !== PHASES.TRICK_PLAY) {
      return { success: false, error: 'Not in trick play phase' };
    }

    // Find the card in player's hand
    const card = this.hands[seatNumber].find(c => c.id === cardId);
    if (!card) {
      return { success: false, error: 'Card not in your hand' };
    }

    // Strict timing rule: Playing a card consumes marriage eligibility
    if (this.marriageEligible[seatNumber]) {
      this.marriageEligible[seatNumber] = false;
    }

    const result = this.trickPlay.playCard(seatNumber, card, this.hands[seatNumber]);
    
    if (result.success) {
      // Remove card from player's hand
      this.hands[seatNumber] = this.hands[seatNumber].filter(c => c.id !== cardId);

      // Check trick completeness to assign marriage eligibility
      if (result.trickComplete) {
        const winnerSeat = result.trickResult.winningSeat;
        if (this.firstTrickWonAt[winnerSeat] === null) {
          this.firstTrickWonAt[winnerSeat] = this.trickPlay.trickNumber - 1;
          this.marriageEligible[winnerSeat] = true;
        }
      }
      
      // If round is complete, calculate scoring
      if (result.roundComplete) {
        // Last trick target adjustment
        const lastTrickWinner = result.trickResult.winningSeat;
        const isBidderTeam = lastTrickWinner === this.bidWinner || lastTrickWinner === this.trickPlay.partnerSeat;
        const lastTrickAdjustment = isBidderTeam ? -10 : 10;
        this.targetScore += lastTrickAdjustment;

        this.phase = PHASES.ROUND_END;
        return {
          ...result,
          targetScore: this.targetScore,
          lastTrickAdjustment,
          partnerKilledInThisTrick: this.trickPlay.partnerKilledInThisTrick,
          partnerRevealedInThisTrick: this.trickPlay.partnerRevealedInThisTrick,
          playedCard: card,
          roundResult: this.calculateRoundResult()
        };
      }
    }

    return {
      ...result,
      playedCard: card,
      partnerKilledInThisTrick: this.trickPlay.partnerKilledInThisTrick,
      partnerRevealedInThisTrick: this.trickPlay.partnerRevealedInThisTrick,
      state: this.trickPlay.getState()
    };
  }

  // ============================================================
  // Phase: Force Reveal Partner
  // ============================================================
  forceRevealPartner(seatNumber) {
    if (this.phase !== PHASES.TRICK_PLAY || seatNumber !== this.bidWinner) {
      return { success: false, error: 'Cannot reveal partner now' };
    }

    if (this.trickPlay.forceReveal()) {
      return { success: true, partnerCalledOut: true };
    }
    return { success: false, error: 'Partner already called out or revealed' };
  }

  // ============================================================
  // Phase: Marriage Declaration
  // ============================================================
  handleDeclareMarriage(seatNumber, suit) {
    if (this.phase !== PHASES.TRICK_PLAY) {
      return { success: false, error: 'Not in trick play phase' };
    }
    if (!this.marriageEligible[seatNumber]) {
      return { success: false, error: 'Not eligible to declare marriage. Must be declared immediately after your first trick win.' };
    }
    
    // Validate duplicates
    if (this.marriages.some(m => m.seat === seatNumber && m.suit === suit)) {
      return { success: false, error: 'Already declared this marriage' };
    }

    // Validate possession of K and Q
    const hand = this.hands[seatNumber] || [];
    const hasKing = hand.some(c => c.rank === 'K' && c.suit === suit);
    const hasQueen = hand.some(c => c.rank === 'Q' && c.suit === suit);
    if (!hasKing || !hasQueen) {
      return { success: false, error: 'You do not have both King and Queen of this suit.' };
    }

    // Calculate Target adjustment
    const isBidderTeam = seatNumber === this.bidWinner || (this.trickPlay && seatNumber === this.trickPlay.partnerSeat);
    const isHukum = suit === this.hukumSuit;
    const adjustmentMag = isHukum ? 40 : 20;

    const targetAdj = isBidderTeam ? -adjustmentMag : adjustmentMag;
    this.targetScore += targetAdj;

    this.marriages.push({ seat: seatNumber, suit, adjustment: targetAdj, isBidderTeam });

    return { success: true, targetScore: this.targetScore, targetAdj };
  }

  // ============================================================
  // Phase: Round End & Scoring
  // ============================================================
  calculateRoundResult() {
    const { bidderTeamPoints, opponentTeamPoints } = this.trickPlay.calculateTeamPoints();
    
    const roundResult = this.scoring.calculateRound({
      bidAmount: this.bidAmount,
      finalTarget: this.targetScore,
      bidderSeat: this.bidWinner,
      partnerSeat: this.trickPlay.partnerSeat,
      bidderTeamPoints,
      opponentTeamPoints,
      vakhaiResults: this.currentVakhaiResults,
      roundNumber: this.roundNumber
    });

    return roundResult;
  }

  /**
   * Prepare for the next round
   */
  nextRound() {
    // Rotate dealer clockwise
    this.dealerSeat = (this.dealerSeat % 4) + 1;
    return this.startRound();
  }

  // ============================================================
  // State Serialization
  // ============================================================
  
  /**
   * Get game state for a specific player
   * Hides other players' cards but shows own hand
   */
  getStateForPlayer(seatNumber) {
    const state = {
      phase: this.phase,
      roundNumber: this.roundNumber,
      dealerSeat: this.dealerSeat,
      myHand: sortHand(this.hands[seatNumber] || []),
      otherPlayersCardCount: {},
      hukumSuit: this.hukumSuit,
      partnerCard: this.partnerCard,
      bidWinner: this.bidWinner,
      bidAmount: this.bidAmount,
      targetScore: this.targetScore,
      scoring: this.scoring.getState(),
      vakhaiResults: this.currentVakhaiResults,
      marriages: this.marriages,
      marriageEligible: this.marriageEligible[seatNumber] || false
    };

    // Card counts for other players
    for (let s = 1; s <= 4; s++) {
      if (s !== seatNumber) {
        state.otherPlayersCardCount[s] = (this.hands[s] || []).length;
      }
    }

    // Phase-specific state
    if (this.vakhai) {
      state.vakhai = this.vakhai.getState();
    }
    if (this.bidding) {
      state.bidding = this.bidding.getState();
    }
    if (this.trickPlay) {
      state.trickPlay = this.trickPlay.getState(seatNumber);
    }

    // Bidder can always see their own partner card selection
    // (Deprecated: Partner card is now globally public)

    return state;
  }

  /**
   * Get full state (for debugging/admin)
   */
  getFullState() {
    return {
      phase: this.phase,
      roundNumber: this.roundNumber,
      dealerSeat: this.dealerSeat,
      hands: this.hands,
      hukumSuit: this.hukumSuit,
      partnerCard: this.partnerCard,
      bidWinner: this.bidWinner,
      bidAmount: this.bidAmount,
      scoring: this.scoring.getState()
    };
  }
}

module.exports = { GameEngine, PHASES };
