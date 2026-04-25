// ============================================================
// Scoring Engine - Marks calculation per round
// ============================================================

/**
 * Scoring rules for 304:
 * - Bid ≤ 220, success → bidder gets +1 mark
 * - Bid > 220, success → bidder gets +2 marks
 * - Bid failure → bidder gets -1 mark
 * - Other players on winning team: +1 mark
 * - Other players on losing team: 0 marks
 */

class Scoring {
  constructor() {
    // Total marks per player across all rounds
    this.totalMarks = { 1: 0, 2: 0, 3: 0, 4: 0 };
    // Marks per round  
    this.roundHistory = [];
  }

  /**
   * Calculate and apply marks for a completed round
   * @param {object} params
   * @param {number} params.bidAmount - The winning bid
   * @param {number} params.bidderSeat - Bidder's seat
   * @param {number} params.partnerSeat - Partner's seat
   * @param {number} params.bidderTeamPoints - Points scored by bidder's team
   * @param {number} params.opponentTeamPoints - Points scored by opponent team
   * @param {Array} params.vakhaiResults - Vakhai results for this round
   * @param {number} params.roundNumber - Current round number
   * @returns {object} Round scoring result
   */
  calculateRound({
    bidAmount, finalTarget, bidderSeat, partnerSeat,
    bidderTeamPoints, opponentTeamPoints,
    vakhaiResults = [], roundNumber
  }) {
    const roundMarks = { 1: 0, 2: 0, 3: 0, 4: 0 };
    
    // Determine if bid was successful using finalTarget
    const bidSuccess = bidderTeamPoints >= finalTarget;
    
    // Bidder team seats
    const bidderTeam = new Set([bidderSeat, partnerSeat]);
    const opponentTeam = new Set();
    for (let s = 1; s <= 4; s++) {
      if (!bidderTeam.has(s)) opponentTeam.add(s);
    }

    if (bidSuccess) {
      if (bidAmount >= 225) {
        roundMarks[bidderSeat] += 2;
        if (partnerSeat && partnerSeat !== bidderSeat) roundMarks[partnerSeat] += 2;
      } else {
        const bidderMarks = bidAmount > 220 ? 2 : 1;
        roundMarks[bidderSeat] += bidderMarks;
        if (partnerSeat && partnerSeat !== bidderSeat) roundMarks[partnerSeat] += 1;
      }
      for (const s of opponentTeam) {
        roundMarks[s] += 0;
      }
    } else {
      if (bidAmount >= 225) {
        roundMarks[bidderSeat] -= 1;
        // partner gets +0 implicitly (it starts at 0)
        for (const s of opponentTeam) roundMarks[s] += 1;
      } else {
        // Build < 225 failed
        roundMarks[bidderSeat] -= 1;
        for (const s of opponentTeam) roundMarks[s] += 1;
      }
    }

    // Apply vakhai marks
    for (const vr of vakhaiResults) {
      roundMarks[vr.seat] = (roundMarks[vr.seat] || 0) + (vr.marks || 0);
    }

    // Update totals
    for (let s = 1; s <= 4; s++) {
      this.totalMarks[s] += roundMarks[s];
    }

    // Store round history
    const roundResult = {
      roundNumber,
      bidAmount,
      finalTarget,
      bidderSeat,
      partnerSeat,
      bidSuccess,
      bidderTeamPoints,
      opponentTeamPoints,
      roundMarks: { ...roundMarks },
      totalMarks: { ...this.totalMarks },
      vakhaiResults
    };

    this.roundHistory.push(roundResult);
    return roundResult;
  }

  /**
   * Apply marks for a Vakhai-only round (no bidding/tricks).
   * Called by GameEngine.handleVakhaiCardPlay when vakhai completes.
   */
  applyVakhaiRound({ vakhaiDeclarer, vakhaiStake, vakhaiDefeated, roundMarks, roundNumber }) {
    // Update totals
    for (let s = 1; s <= 4; s++) {
      this.totalMarks[s] += (roundMarks[s] || 0);
    }

    const roundResult = {
      roundNumber,
      isVakhaiRound: true,
      vakhaiDeclarer,
      vakhaiStake,
      vakhaiDefeated,
      bidAmount: vakhaiStake,
      finalTarget: vakhaiStake,
      bidderSeat: vakhaiDeclarer,
      partnerSeat: null,
      bidSuccess: !vakhaiDefeated,
      bidderTeamPoints: 0,
      opponentTeamPoints: 0,
      roundMarks: { ...roundMarks },
      totalMarks: { ...this.totalMarks },
      vakhaiResults: []
    };

    this.roundHistory.push(roundResult);
    return roundResult;
  }

  /**
   * Check if any termination condition is met
   * Standard 304: game can end when agreed upon by players
   * Or after a fixed number of rounds
   */
  checkGameEnd(targetScore = null) {
    if (!targetScore) return { ended: false };
    
    for (let s = 1; s <= 4; s++) {
      if (this.totalMarks[s] >= targetScore) {
        return {
          ended: true,
          winner: s,
          finalMarks: { ...this.totalMarks }
        };
      }
    }
    return { ended: false };
  }

  /**
   * Get scoring state for clients
   */
  getState() {
    return {
      totalMarks: { ...this.totalMarks },
      roundHistory: this.roundHistory
    };
  }
}

module.exports = { Scoring };
