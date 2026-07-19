// utils/bounty.js
//
// Bounty system: members put coins on another member's head, and whoever
// successfully /robs that target claims the whole pot on top of the steal.
//
// Design decisions worth knowing:
//   - Contributions are deducted from the contributor's balance IMMEDIATELY
//     when they put up a bounty. This isn't a pledge, it's a real payment —
//     the coins sit in escrow until claimed or refunded. No fake bounties.
//   - Multiple people can stack coins onto the same target's bounty. Each
//     new contribution ALSO resets the expiry timer to now + duration, so
//     an actively-growing bounty naturally stays alive longer than a stale
//     one nobody's adding to.
//   - If a bounty expires unclaimed, every contributor is refunded their
//     exact share automatically the next time any bounty read/write touches
//     that guild (lazy sweep — no background cron job needed).
//   - Claiming happens from rob.js: a successful robbery on a wanted target
//     pays out the full bounty pot to the robber, then clears it.

const { db } = require('../db');
const { getBalance, addBalance } = require('./economy');

const MIN_BOUNTY = 50;
const DEFAULT_DURATION_MS = 24 * 60 * 60 * 1000; // 24h

async function ensureBountyRow(guildId, targetId) {
  await db.execute({
    sql: `INSERT INTO bounties (guild_id, target_id, total_amount, created_at, expires_at)
          VALUES (?, ?, 0, ?, ?) ON CONFLICT(guild_id, target_id) DO NOTHING`,
    args: [guildId, targetId, Date.now(), Date.now()],
  });
}

// Refunds and removes any bounty in this guild whose expiry has passed and
// was never claimed. Called at the top of every read/write below instead of
// on a timer — cheap enough to just always check, and means no scheduler
// needs to be wired into ready.js.
async function sweepExpired(guildId) {
  const now = Date.now();
  const expired = await db.execute({
    sql: 'SELECT target_id FROM bounties WHERE guild_id = ? AND expires_at < ? AND total_amount > 0',
    args: [guildId, now],
  });

  for (const row of expired.rows) {
    const targetId = row.target_id;
    const contributions = await db.execute({
      sql: 'SELECT contributor_id, amount FROM bounty_contributions WHERE guild_id = ? AND target_id = ?',
      args: [guildId, targetId],
    });

    for (const c of contributions.rows) {
      await addBalance(guildId, c.contributor_id, Number(c.amount));
    }

    await db.execute({
      sql: 'DELETE FROM bounty_contributions WHERE guild_id = ? AND target_id = ?',
      args: [guildId, targetId],
    });
    await db.execute({
      sql: 'DELETE FROM bounties WHERE guild_id = ? AND target_id = ?',
      args: [guildId, targetId],
    });
  }
}

// Adds to (or creates) the bounty on a target. Validates the contributor
// actually has the funds BEFORE deducting — addBalance() clamps at 0 rather
// than rejecting, so this check has to happen here, not inside addBalance.
async function addBounty(guildId, targetId, contributorId, amount, durationMs = DEFAULT_DURATION_MS) {
  await sweepExpired(guildId);

  const balance = await getBalance(guildId, contributorId);
  if (balance < amount) {
    return { ok: false, reason: 'insufficient_funds', balance };
  }

  await ensureBountyRow(guildId, targetId);
  await addBalance(guildId, contributorId, -amount);

  const now = Date.now();
  await db.execute({
    sql: `UPDATE bounties SET total_amount = total_amount + ?, expires_at = ?
          WHERE guild_id = ? AND target_id = ?`,
    args: [amount, now + durationMs, guildId, targetId],
  });
  await db.execute({
    sql: `INSERT INTO bounty_contributions (guild_id, target_id, contributor_id, amount, created_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [guildId, targetId, contributorId, amount, now],
  });

  const bounty = await getBounty(guildId, targetId);
  return { ok: true, bounty };
}

// Full detail on one target's bounty: total, expiry, and a per-contributor
// breakdown (so /bounty check can show "who put up how much").
async function getBounty(guildId, targetId) {
  await sweepExpired(guildId);

  const res = await db.execute({
    sql: 'SELECT * FROM bounties WHERE guild_id = ? AND target_id = ?',
    args: [guildId, targetId],
  });
  if (!res.rows[0] || Number(res.rows[0].total_amount) <= 0) return null;

  const contributors = await db.execute({
    sql: `SELECT contributor_id, SUM(amount) as amount FROM bounty_contributions
          WHERE guild_id = ? AND target_id = ? GROUP BY contributor_id`,
    args: [guildId, targetId],
  });

  return {
    targetId,
    totalAmount: Number(res.rows[0].total_amount),
    expiresAt: Number(res.rows[0].expires_at),
    contributors: contributors.rows.map(r => ({
      contributorId: r.contributor_id,
      amount: Number(r.amount),
    })),
  };
}

// Top N active bounties in a guild, highest first — powers /bounty list.
async function getActiveBounties(guildId, limit = 10) {
  await sweepExpired(guildId);

  const res = await db.execute({
    sql: `SELECT * FROM bounties WHERE guild_id = ? AND total_amount > 0
          ORDER BY total_amount DESC LIMIT ?`,
    args: [guildId, limit],
  });

  return res.rows.map(r => ({
    targetId: r.target_id,
    totalAmount: Number(r.total_amount),
    expiresAt: Number(r.expires_at),
  }));
}

// Pays out and clears a target's bounty in full. Called from rob.js
// immediately after a successful robbery. Returns the claimed amount, or 0
// if the target had no active bounty (the normal case — most robberies
// won't involve a wanted target).
async function claimBounty(guildId, targetId, claimerId) {
  const bounty = await getBounty(guildId, targetId);
  if (!bounty) return 0;

  await addBalance(guildId, claimerId, bounty.totalAmount);
  await db.execute({
    sql: 'DELETE FROM bounty_contributions WHERE guild_id = ? AND target_id = ?',
    args: [guildId, targetId],
  });
  await db.execute({
    sql: 'DELETE FROM bounties WHERE guild_id = ? AND target_id = ?',
    args: [guildId, targetId],
  });

  return bounty.totalAmount;
}

module.exports = {
  MIN_BOUNTY,
  DEFAULT_DURATION_MS,
  addBounty,
  getBounty,
  getActiveBounties,
  claimBounty,
  sweepExpired,
};
