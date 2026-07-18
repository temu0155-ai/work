// utils/blackjack.js
// Pure game logic, no Discord-specific code, so it's easy to test standalone.

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function freshDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cardValue(card) {
  if (card.rank === 'A') return 11;
  if (['J', 'Q', 'K'].includes(card.rank)) return 10;
  return Number(card.rank);
}

// Returns the best hand total, treating aces as 1 where needed to avoid busting.
function handTotal(hand) {
  let total = hand.reduce((sum, card) => sum + cardValue(card), 0);
  let aces = hand.filter((c) => c.rank === 'A').length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

function formatHand(hand) {
  return hand.map((c) => `${c.rank}${c.suit}`).join(' ');
}

function isBlackjack(hand) {
  return hand.length === 2 && handTotal(hand) === 21;
}

// Dealer hits until 17+ (stands on soft 17, the common casual-play rule).
function playDealer(deck, dealerHand) {
  while (handTotal(dealerHand) < 17) {
    dealerHand.push(deck.pop());
  }
  return dealerHand;
}

// Compares player vs dealer after both are done. Returns one of:
// 'player_blackjack', 'player_bust', 'dealer_bust', 'player_win', 'dealer_win', 'push'
function resolveOutcome(playerHand, dealerHand) {
  const playerTotal = handTotal(playerHand);
  const dealerTotal = handTotal(dealerHand);

  if (isBlackjack(playerHand) && !isBlackjack(dealerHand)) return 'player_blackjack';
  if (playerTotal > 21) return 'player_bust';
  if (dealerTotal > 21) return 'dealer_bust';
  if (playerTotal > dealerTotal) return 'player_win';
  if (playerTotal < dealerTotal) return 'dealer_win';
  return 'push';
}

module.exports = { freshDeck, cardValue, handTotal, formatHand, isBlackjack, playDealer, resolveOutcome };
