// db/index.js
// Connects to a Turso database (hosted SQLite over the network). Because
// this bot runs on GitHub Actions and gets its filesystem wiped on every
// restart, XP data needs to live somewhere off-box — Turso's free tier is
// perfect for this: no server to manage, plain SQL, tiny latency.
//
// Setup (one-time):
//   1. npm install -g @turso/cli   (or see https://docs.turso.tech/quickstart)
//   2. turso auth signup                (free account, no credit card)
//   3. turso db create leveling-bot
//   4. turso db show leveling-bot --url          -> TURSO_DATABASE_URL
//   5. turso db tokens create leveling-bot        -> TURSO_AUTH_TOKEN
//   6. Add both to your local .env AND as GitHub Actions secrets
//      (see the updated bot.yml)

const { createClient } = require('@libsql/client');

const configured = Boolean(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);

if (!configured) {
  console.warn(
    '[db] TURSO_DATABASE_URL or TURSO_AUTH_TOKEN is missing — leveling commands will fail until these are set. The rest of the bot (music, /setup) is unaffected.'
  );
}

// Only construct a real client if credentials are present. Otherwise export
// a stub that throws a clear error the moment something tries to use it,
// instead of crashing the whole process at import time and taking the
// music/AI-setup features down with it.
const db = configured
  ? createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN })
  : {
      execute: async () => {
        throw new Error('Turso is not configured — set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.');
      },
    };

async function initDb() {
  if (!configured) return; // nothing to do — warning already logged above
  await db.execute(`
    CREATE TABLE IF NOT EXISTS levels (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      xp INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 0,
      messages INTEGER NOT NULL DEFAULT 0,
      voice_minutes INTEGER NOT NULL DEFAULT 0,
      last_message_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    )
  `);

  // Currency + daily-game state for /blackjack, /wordle, /daily, /balance.
  // Separate table from `levels` since it's a different concern (games,
  // not leveling) even though it's keyed the same way.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS economy (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      balance INTEGER NOT NULL DEFAULT 100,
      last_daily_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS wordle_progress (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      word_date TEXT NOT NULL,
      guesses TEXT NOT NULL DEFAULT '[]',
      solved INTEGER NOT NULL DEFAULT 0,
      streak INTEGER NOT NULL DEFAULT 0,
      last_played_date TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (guild_id, user_id)
    )
  `);

  console.log('[db] Connected to Turso and ensured schema exists.');
}

module.exports = { db, initDb };
