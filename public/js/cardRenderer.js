// ============================================================
// Card Renderer – Premium card DOM elements with full face
// ============================================================

const SUIT_SYMBOLS = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
const SUIT_COLORS  = { spades: 'black', hearts: 'red', diamonds: 'red', clubs: 'black' };

const CardRenderer = {

  /**
   * Render a hand of cards into a container
   */
  renderHand(container, cards, options = {}) {
    container.innerHTML = '';
    const {
      playable = false,
      playableCards = null,
      trumpSuit = null,
      onCardClick = null
    } = options;

    cards.forEach(card => {
      const el = this.createCardElement(card);

      // Mark trump cards
      if (trumpSuit && card.suit === trumpSuit) {
        el.classList.add('trump-card');
        // Add crown badge
        const crown = document.createElement('div');
        crown.className = 'card-trump-badge';
        crown.textContent = '♛';
        el.appendChild(crown);
      }

      if (playable) {
        const canPlay = !playableCards || playableCards.includes(card.id);
        el.classList.add(canPlay ? 'playable' : 'not-playable');
        if (canPlay && onCardClick) {
          el.addEventListener('click', () => onCardClick(card));
        }
      }

      container.appendChild(el);
    });
  },

  /**
   * Create a single premium card DOM element
   */
  createCardElement(card) {
    const el = document.createElement('div');
    const colorClass = SUIT_COLORS[card.suit] === 'red' ? 'card-red' : 'card-black';
    el.className = `card ${colorClass}`;
    el.dataset.cardId = card.id;

    const symbol = SUIT_SYMBOLS[card.suit];

    el.innerHTML = `
      <div class="card-corner">
        <span class="card-corner-rank">${card.rank}</span>
        <span class="card-corner-suit">${symbol}</span>
      </div>
      <div class="card-rank">${card.rank}</div>
      <div class="card-suit-symbol">${symbol}</div>
      <div class="card-corner-br">
        <span class="card-corner-rank">${card.rank}</span>
        <span class="card-corner-suit">${symbol}</span>
      </div>
      ${card.points > 0 ? `<div class="card-points">${card.points}pt</div>` : ''}
    `;

    return el;
  },

  /**
   * Render a card in the trick area slot
   */
  renderTrickCard(slotEl, card) {
    if (!slotEl) return;
    const colorClass = SUIT_COLORS[card.suit] === 'red' ? 'card-red' : 'card-black';
    const symbol = SUIT_SYMBOLS[card.suit];
    slotEl.innerHTML = `
      <div class="trick-card ${colorClass} card-drop-anim">
        <div class="card-corner">
          <span class="card-corner-rank">${card.rank}</span>
          <span class="card-corner-suit">${symbol}</span>
        </div>
        <div class="card-rank">${card.rank}</div>
        <div class="card-suit-symbol">${symbol}</div>
        <div class="card-corner-br">
          <span class="card-corner-rank">${card.rank}</span>
          <span class="card-corner-suit">${symbol}</span>
        </div>
      </div>
    `;
  },

  /**
   * Render opponent card backs (premium pattern)
   */
  renderOpponentCards(container, count) {
    container.innerHTML = '';
    const displayCount = Math.min(count, 8);
    for (let i = 0; i < displayCount; i++) {
      const back = document.createElement('div');
      back.className = 'card-back';
      container.appendChild(back);
    }
  },

  /**
   * Render partner card options — grouped by rank (Points descending order)
   */
  renderPartnerOptions(container, excludeCards = [], onSelect) {
    container.innerHTML = '';
    const ranks = ['J', '9', 'A', '10', 'K', 'Q', '8', '7'];
    const suits = ['spades', 'diamonds', 'clubs', 'hearts'];
    let selected = null;

    ranks.forEach(rank => {
      const rankRow = document.createElement('div');
      rankRow.style.display = 'flex';
      rankRow.style.justifyContent = 'center';
      rankRow.style.gap = '8px';
      rankRow.style.marginBottom = '8px';
      rankRow.style.width = '100%';

      let hasCards = false;

      suits.forEach(suit => {
        const cardId = `${rank}_${suit}`;
        // Skip cards strictly excluded (like ones in hand)
        if (excludeCards.includes(cardId)) return;
        
        hasCards = true;

        const colorClass = SUIT_COLORS[suit] === 'red' ? 'card-red' : 'card-black';
        const symbol = SUIT_SYMBOLS[suit];

        const el = document.createElement('div');
        el.className = `partner-card-option ${colorClass}`;
        el.dataset.cardId = cardId;
        el.innerHTML = `
          <div class="card-rank">${rank}</div>
          <div class="card-suit-symbol">${symbol}</div>
        `;

        el.addEventListener('click', () => {
          if (selected) selected.classList.remove('selected');
          el.classList.add('selected');
          selected = el;
          onSelect(cardId);
        });

        rankRow.appendChild(el);
      });

      if (hasCards) {
        container.appendChild(rankRow);
      }
    });
  }
};

window.CardRenderer = CardRenderer;
