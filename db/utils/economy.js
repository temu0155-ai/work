// utils/economy.js
// Simple currency system backing /blackjack, /wordle, /daily, /balance.
// Lives in the same Turso DB as leveling, in its own `economy` table.

const { db } = require('../db');

const STARTING_BALANCE = 100;
const DAILY_AMOUNT = 150;
const DAILY_COOLDOWN_MS = 20 * 60 * 60 * 1000; // 20h, slightly forgiving vs a strict 24h

async function ensureAccount(guildId, userId) {
  await db.execute({
    sql: 'INSERT INTO economy (guild_id, user_id, balance) VALUES (?, ?, ?) ON CONFLICT(guild_id, user_id) DO NOTHING',
    args: [guildId, userId, STARTING_BALANCE],
  });
}

async function getAccount(guildId, userId) {
  await ensureAccount(guildId, userId);
  const res = await db.execute({
    sql: 'SELECT * FROM economy WHERE guild_id = ? AND user_id = ?',
    args: [guildId, userId],
  });
  return res.rows[0];
}

async function getBalance(guildId, userId) {
  const account = await getAccount(guildId, userId);
  return Number(account.balance);
}

// amount can be negative (e.g. a bet loss). Balance is clamped to 0 — you
// can't go into debt.
async function addBalance(guildId, userId, amount) {
  const account = await getAccount(guildId, userId);
  const newBalance = Math.max(0, Number(account.balance) + amount);
  await db.execute({
    sql: 'UPDATE economy SET balance = ? WHERE guild_id = ? AND user_id = ?',
    args: [newBalance, guildId, userId],
  });
  return newBalance;
}

// Returns { claimed: true, amount, newBalance } or { claimed: false, msRemaining }.
async function claimDaily(guildId, userId) {
  const account = await getAccount(guildId, userId);
  const now = Date.now();
  const elapsed = now - Number(account.last_daily_at);

  if (elapsed < DAILY_COOLDOWN_MS) {
    return { claimed: false, msRemaining: DAILY_COOLDOWN_MS - elapsed };
  }

  const newBalance = Number(account.balance) + DAILY_AMOUNT;
  await db.execute({
    sql: 'UPDATE economy SET balance = ?, last_daily_at = ? WHERE guild_id = ? AND user_id = ?',
    args: [newBalance, now, guildId, userId],
  });
  return { claimed: true, amount: DAILY_AMOUNT, newBalance };
}

module.exports = { STARTING_BALANCE, DAILY_AMOUNT, ensureAccount, getAccount, getBalance, addBalance, claimDaily };
