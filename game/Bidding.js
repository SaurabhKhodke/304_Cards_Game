// ============================================================
// Bidding Phase - Auction for hukum/trump selection
// ============================================================

const MIN_BID = 150;
const MAX_BID = 304;

class BiddingPhase {
  constructor() {
    this.currentBid = 0;         // Current highest bid
    this.currentBidder = null;   // Seat of current highest bidder
    this.currentTurn = null;     // Seat of player whose turn it is
    this.turnOrder = [];         // Clockwise order
    this.activeBidders = new Set(); // Players still in bidding
    this.history = [];           // Bid history for display
    this.completed = false;
    this.winner = null;          // { seat, bid }
  }

  /**
   * Initialize bidding phase
   * @param {number} startSeat - seat that bids first
   */
  initialize(startSeat) {
    this.turnOrder = [];
    this.activeBidders = new Set();
    for (let i = 0; i < 4; i++) {
      const seat = ((startSeat - 1 + i) % 4) + 1;
      this.turnOrder.push(seat);
      this.activeBidders.add(seat);
    }
    this.currentTurn = this.turnOrder[0];
    this.currentBid = 0;
    this.currentBidder = null;
    this.history = [];
    this.completed = false;
    this.winner = null;
  }

  /**
   * Player places a bid
   * @param {number} seatNumber
   * @param {number} bidAmount
   * @returns {object} { success, error? }
   */
  placeBid(seatNumber, bidAmount) {
    if (seatNumber !== this.currentTurn) {
      return { success: false, error: 'Not your turn to bid' };
    }
    if (!this.activeBidders.has(seatNumber)) {
      return { success: false, error: 'You have already passed' };
    }
    if (bidAmount < MIN_BID) {
      return { success: false, error: `Minimum bid is ${MIN_BID}` };
    }
    if (bidAmount > MAX_BID) {
      return { success: false, error: `Maximum bid is ${MAX_BID}` };
    }
    if (bidAmount <= this.currentBid) {
      return { success: false, error: `Bid must be higher than current bid (${this.currentBid})` };
    }

    this.currentBid = bidAmount;
    this.currentBidder = seatNumber;
    this.history.push({ seat: seatNumber, action: 'bid', amount: bidAmount });
    
    this.advanceTurn();
    return { success: true, bid: bidAmount };
  }

  /**
   * Player passes on bidding
   */
  passBid(seatNumber) {
    if (seatNumber !== this.currentTurn) {
      return { success: false, error: 'Not your turn to bid' };
    }
    if (!this.activeBidders.has(seatNumber)) {
      return { success: false, error: 'You have already passed' };
    }
    
    // First bid can't be a pass if no one has bid yet
    // Actually in 304 you can pass even as the first bidder
    this.activeBidders.delete(seatNumber);
    this.history.push({ seat: seatNumber, action: 'pass' });
    
    this.advanceTurn();
    return { success: true };
  }

  /**
   * Advance to the next active bidder
   */
  advanceTurn() {
    // Check win condition: only one bidder left
    if (this.activeBidders.size === 1 && this.currentBid > 0) {
      const winningSeat = [...this.activeBidders][0];
      this.winner = { seat: winningSeat, bid: this.currentBid };
      this.completed = true;
      this.currentTurn = null;
      return;
    }

    // If all players passed without any bid, force minimum bid on dealer
    if (this.activeBidders.size === 0) {
      // The last person who had a bid wins, or if no one bid, 
      // the dealer (first in rotation) is forced to bid MIN_BID
      if (this.currentBidder) {
        this.winner = { seat: this.currentBidder, bid: this.currentBid };
      } else {
        // Force bid on first player in turn order
        this.winner = { seat: this.turnOrder[0], bid: MIN_BID };
        this.currentBid = MIN_BID;
      }
      this.completed = true;
      this.currentTurn = null;
      return;
    }

    // Find next active bidder in clockwise order
    const currentIndex = this.turnOrder.indexOf(this.currentTurn);
    let nextIndex = (currentIndex + 1) % this.turnOrder.length;
    let loopCount = 0;
    
    while (!this.activeBidders.has(this.turnOrder[nextIndex]) && loopCount < 4) {
      nextIndex = (nextIndex + 1) % this.turnOrder.length;
      loopCount++;
    }

    // Skip the current bidder's turn (they already have the highest bid)
    if (this.turnOrder[nextIndex] === this.currentBidder && this.activeBidders.size <= 2) {
      // Find the other active bidder
      for (const seat of this.activeBidders) {
        if (seat !== this.currentBidder) {
          this.currentTurn = seat;
          return;
        }
      }
    }

    this.currentTurn = this.turnOrder[nextIndex];
  }

  /**
   * Get current state for clients
   */
  getState() {
    return {
      currentBid: this.currentBid,
      currentBidder: this.currentBidder,
      currentTurn: this.currentTurn,
      activeBidders: [...this.activeBidders],
      history: this.history,
      completed: this.completed,
      winner: this.winner,
      minBid: this.currentBid > 0 ? this.currentBid + 1 : MIN_BID,
      maxBid: MAX_BID
    };
  }
}

module.exports = { BiddingPhase, MIN_BID, MAX_BID };
