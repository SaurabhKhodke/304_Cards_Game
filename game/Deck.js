// ============================================================
// Deck Module - 32-card deck for 304 game
// ============================================================

// Card point values in the 304 game
// Total points across all cards = 304
const POINT_VALUES = {
  'J': 30, '9': 20, 'A': 11, '10': 10,
  'K': 3, 'Q': 2, '8': 0, '7': 0
};

// Card strength order for trick comparison (highest to lowest)
// In 304, J is the strongest, then 9, A, 10, K, Q, 8, 7
const RANK_STRENGTH = {
  'J': 8, '9': 7, 'A': 6, '10': 5,
  'K': 4, 'Q': 3, '8': 2, '7': 1
};

const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// Suit display info
const SUIT_SYMBOLS = {
  spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣'
};
const SUIT_COLORS = {
  spades: 'black', hearts: 'red', diamonds: 'red', clubs: 'black'
};

/**
 * Create a full 32-card deck
 * Each card: { rank, suit, points, strength, id }
 */
function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        id: `${rank}_${suit}`,
        rank,
        suit,
        points: POINT_VALUES[rank],
        strength: RANK_STRENGTH[rank],
        symbol: SUIT_SYMBOLS[suit],
        color: SUIT_COLORS[suit]
      });
    }
  }
  return deck;
}

/**
 * Fisher-Yates shuffle algorithm (secure, fair shuffle)
 */
function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Deal cards to players in clockwise order
 * @param {Array} deck - shuffled deck
 * @param {number} startSeat - seat number that gets dealt to first (1-4)
 * @param {number} cardsPerPlayer - how many cards each player gets
 * @returns {Object} { hands: { 1: [...], 2: [...], 3: [...], 4: [...] }, remainingDeck }
 */
function dealCards(deck, startSeat, cardsPerPlayer) {
  const hands = { 1: [], 2: [], 3: [], 4: [] };
  const deckCopy = [...deck];
  
  // Deal in clockwise order from startSeat
  const seatOrder = [];
  for (let i = 0; i < 4; i++) {
    seatOrder.push(((startSeat - 1 + i) % 4) + 1);
  }

  for (let round = 0; round < cardsPerPlayer; round++) {
    for (const seat of seatOrder) {
      if (deckCopy.length > 0) {
        hands[seat].push(deckCopy.shift());
      }
    }
  }

  return { hands, remainingDeck: deckCopy };
}

/**
 * Compare two cards within the same suit
 * Returns positive if cardA > cardB, negative if cardA < cardB
 */
function compareCards(cardA, cardB) {
  return cardA.strength - cardB.strength;
}

/**
 * Determine the winner of a trick
 * @param {Array} playedCards - [{seat, card}, ...] in order played
 * @param {string} trumpSuit - the hukum/trump suit
 * @returns {object} { winningSeat, winningCard, points }
 */
function determineTrickWinner(playedCards, trumpSuit) {
  const leadSuit = playedCards[0].card.suit;
  let winner = playedCards[0];
  let totalPoints = 0;

  for (const play of playedCards) {
    totalPoints += play.card.points;
    
    if (play === playedCards[0]) continue;

    const currentIsTrump = play.card.suit === trumpSuit;
    const winnerIsTrump = winner.card.suit === trumpSuit;

    if (currentIsTrump && !winnerIsTrump) {
      // Trump beats non-trump
      winner = play;
    } else if (currentIsTrump && winnerIsTrump) {
      // Both trump: higher strength wins
      if (play.card.strength > winner.card.strength) {
        winner = play;
      }
    } else if (!currentIsTrump && !winnerIsTrump) {
      // Neither trump: must follow lead suit to win
      if (play.card.suit === leadSuit && winner.card.suit === leadSuit) {
        if (play.card.strength > winner.card.strength) {
          winner = play;
        }
      } else if (play.card.suit === leadSuit && winner.card.suit !== leadSuit) {
        winner = play;
      }
      // If current card doesn't follow lead and isn't trump, it can't win
    }
  }

  return {
    winningSeat: winner.seat,
    winningCard: winner.card,
    points: totalPoints
  };
}

/**
 * Calculate total points in a set of cards
 */
function calculatePoints(cards) {
  return cards.reduce((sum, card) => sum + card.points, 0);
}

/**
 * Sort cards by suit then by strength (for display)
 */
function sortHand(cards) {
  const suitOrder = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 };
  return [...cards].sort((a, b) => {
    if (suitOrder[a.suit] !== suitOrder[b.suit]) {
      return suitOrder[a.suit] - suitOrder[b.suit];
    }
    return b.strength - a.strength;
  });
}

module.exports = {
  POINT_VALUES, RANK_STRENGTH, SUITS, RANKS,
  SUIT_SYMBOLS, SUIT_COLORS,
  createDeck, shuffleDeck, dealCards,
  compareCards, determineTrickWinner,
  calculatePoints, sortHand
};
