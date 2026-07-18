// utils/wordle.js
// Pure game logic for the daily word game — no Discord/DB code, easy to
// unit test standalone.

const WORDS = require('../../data/words');

function todayDateString() {
  return new Date().toISOString().slice(0, 10); // e.g. "2026-07-18", UTC-based
}

// Same word for everyone on a given day, deterministic from the date.
function getWordForDate(dateStr) {
  const daysSinceEpoch = Math.floor(Date.parse(`${dateStr}T00:00:00Z`) / 86_400_000);
  const index = ((daysSinceEpoch % WORDS.length) + WORDS.length) % WORDS.length;
  return WORDS[index].toUpperCase();
}

function dateDiffDays(laterDateStr, earlierDateStr) {
  const later = Date.parse(`${laterDateStr}T00:00:00Z`);
  const earlier = Date.parse(`${earlierDateStr}T00:00:00Z`);
  return Math.round((later - earlier) / 86_400_000);
}

// Standard two-pass wordle evaluation — handles duplicate letters correctly
// (e.g. guessing "ARENA" against target "RADAR" shouldn't over-credit the A's).
function evaluateGuess(guess, target) {
  const guessLetters = guess.toUpperCase().split('');
  const targetLetters = target.toUpperCase().split('');
  const result = new Array(5).fill('absent');
  const remaining = {};

  // Pass 1: exact matches
  for (let i = 0; i < 5; i++) {
    if (guessLetters[i] === targetLetters[i]) {
      result[i] = 'correct';
    } else {
      remaining[targetLetters[i]] = (remaining[targetLetters[i]] || 0) + 1;
    }
  }

  // Pass 2: right letter, wrong spot
  for (let i = 0; i < 5; i++) {
    if (result[i] === 'correct') continue;
    const letter = guessLetters[i];
    if (remaining[letter] > 0) {
      result[i] = 'present';
      remaining[letter] -= 1;
    }
  }

  return result.map((status, i) => ({ letter: guessLetters[i], status }));
}

const EMOJI = { correct: '🟩', present: '🟨', absent: '⬛' };

function formatGuessBlock(evaluation) {
  const letters = evaluation.map((e) => e.letter).join(' ');
  const squares = evaluation.map((e) => EMOJI[e.status]).join('');
  return `\`${letters}\`\n${squares}`;
}

module.exports = { todayDateString, getWordForDate, dateDiffDays, evaluateGuess, formatGuessBlock };
