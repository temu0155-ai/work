// db/index.js
const { createClient } = require('@libsql/client');

const configured = Boolean(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);

if (!configured) {
  console.warn(
    '[db] TURSO_DATABASE_URL or TURSO_AUTH_TOKEN is missing — leveling commands will fail until these are set. The rest of the bot (music, /setup) is unaffected.'
  );
}

const db = configured
  ? createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN })
  : {
      execute: async () => {
        throw new Error('Turso is not configured — set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.');
      },
    };

async function initDb() {
  if (!configured) return; 

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

  await db.execute(`
    CREATE TABLE IF NOT EXISTS economy (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      balance INTEGER NOT NULL DEFAULT 100,
      last_daily_at INTEGER NOT NULL DEFAULT 0,
      last_rob_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    )
  `);

  try {
    await db.execute('ALTER TABLE economy ADD COLUMN last_rob_at INTEGER NOT NULL DEFAULT 0');
    console.log('[db] Migrated: added last_rob_at to economy table.');
  } catch (err) {
    if (!/duplicate column/i.test(err.message)) {
      console.error('[db] Unexpected error migrating last_rob_at:', err);
    }
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS bounties (
      guild_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      total_amount INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      PRIMARY KEY (guild_id, target_id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS bounty_contributions (
      guild_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      contributor_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      created_at INTEGER NOT NULL
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

module.exports = { db, initDb };  // Migration: adds last_rob_at to the economy table if it was created
  // before /rob existed. CREATE TABLE IF NOT EXISTS above only applies to
  // brand-new databases, so existing ones need this explicit ALTER. The
  // try/catch swallows the "duplicate column" error on every subsequent
  // boot once the column already exists — cheap enough to just always run.
  try {
    await db.execute('ALTER TABLE economy ADD COLUMN last_rob_at INTEGER NOT NULL DEFAULT 0');
    console.log('[db] Migrated: added last_rob_at to economy table.');
  } catch (err) {
    // Expected on every boot after the first migration — column already exists.
    if (!/duplicate column/i.test(err.message)) {
      console.error('[db] Unexpected error migrating last_rob_at:', err);
    }
  }

  // Bounty system (see utils/bounty.js). One row per guild+target holding
  // the running total, plus a contributions table so multiple people can
  // stack coins onto the same bounty and each be refunded individually if
  // it expires unclaimed.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS bounties (
      guild_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      total_amount INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      PRIMARY KEY (guild_id, target_id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS bounty_contributions (
      guild_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      contributor_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      created_at INTEGER NOT NULL
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

```
