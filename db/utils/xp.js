// utils/xp.js
// Core leveling logic shared by the message/voice trackers and the
// /rank and /leaderboard commands.

const { db } = require('../db');

// XP required to go from `level` to `level + 1`. This is the classic
// MEE6-style curve — starts cheap, ramps up gradually.
function xpForLevel(level) {
  return 5 * level * level + 50 * level + 100;
}

async function ensureUser(guildId, userId) {
  await db.execute({
    sql: 'INSERT INTO levels (guild_id, user_id) VALUES (?, ?) ON CONFLICT(guild_id, user_id) DO NOTHING',
    args: [guildId, userId],
  });
}

async function getUser(guildId, userId) {
  const res = await db.execute({
    sql: 'SELECT * FROM levels WHERE guild_id = ? AND user_id = ?',
    args: [guildId, userId],
  });
  return res.rows[0] || null;
}

// Applies `xpAmount` to a user, handling level-up rollover, and persists
// message/voice stat counters. Returns { leveledUp, level, xp } so callers
// (message/voice trackers) can announce level-ups.
async function applyXp(guildId, userId, xpAmount, { messageDelta = 0, voiceMinutesDelta = 0, lastMessageAt } = {}) {
  await ensureUser(guildId, userId);
  const user = await getUser(guildId, userId);

  let xp = Number(user.xp) + xpAmount;
  let level = Number(user.level);
  let leveledUp = false;
  let required = xpForLevel(level);

  while (xp >= required) {
    xp -= required;
    level += 1;
    leveledUp = true;
    required = xpForLevel(level);
  }

  const messages = Number(user.messages) + messageDelta;
  const voiceMinutes = Number(user.voice_minutes) + voiceMinutesDelta;
  const lastMessageAtValue = lastMessageAt ?? Number(user.last_message_at);

  await db.execute({
    sql: `UPDATE levels
          SET xp = ?, level = ?, messages = ?, voice_minutes = ?, last_message_at = ?
          WHERE guild_id = ? AND user_id = ?`,
    args: [xp, level, messages, voiceMinutes, lastMessageAtValue, guildId, userId],
  });

  return { leveledUp, level, xp, xpForNext: required };
}

const MESSAGE_XP_MIN = 15;
const MESSAGE_XP_MAX = 25;
const MESSAGE_COOLDOWN_MS = 60_000; // one XP-earning message per minute per user

async function addMessageXp(guildId, userId) {
  await ensureUser(guildId, userId);
  const user = await getUser(guildId, userId);
  const now = Date.now();

  if (now - Number(user.last_message_at) < MESSAGE_COOLDOWN_MS) {
    return null; // still on cooldown, no XP awarded
  }

  const amount = Math.floor(Math.random() * (MESSAGE_XP_MAX - MESSAGE_XP_MIN + 1)) + MESSAGE_XP_MIN;
  return applyXp(guildId, userId, amount, { messageDelta: 1, lastMessageAt: now });
}

const VOICE_XP_PER_MINUTE = 8;

async function addVoiceXp(guildId, userId, minutes) {
  if (minutes <= 0) return null;
  const amount = Math.round(minutes * VOICE_XP_PER_MINUTE);
  if (amount <= 0) return null;
  return applyXp(guildId, userId, amount, { voiceMinutesDelta: minutes });
}

async function getLeaderboard(guildId, limit = 10) {
  const res = await db.execute({
    sql: 'SELECT * FROM levels WHERE guild_id = ? ORDER BY level DESC, xp DESC LIMIT ?',
    args: [guildId, limit],
  });
  return res.rows;
}

// 1-indexed position of a user on their guild's leaderboard.
async function getRankPosition(guildId, userId) {
  const res = await db.execute({
    sql: `SELECT COUNT(*) as higher_count FROM levels
          WHERE guild_id = ? AND (
            level > (SELECT level FROM levels WHERE guild_id = ? AND user_id = ?)
            OR (
              level = (SELECT level FROM levels WHERE guild_id = ? AND user_id = ?)
              AND xp > (SELECT xp FROM levels WHERE guild_id = ? AND user_id = ?)
            )
          )`,
    args: [guildId, guildId, userId, guildId, userId, guildId, userId],
  });
  return Number(res.rows[0].higher_count) + 1;
}

module.exports = {
  xpForLevel,
  ensureUser,
  getUser,
  applyXp,
  addMessageXp,
  addVoiceXp,
  getLeaderboard,
  getRankPosition,
};
