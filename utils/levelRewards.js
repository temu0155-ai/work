/**
 * utils/levelRewards.js
 *
 * Ties level-ups to auto-assigned roles + a coin payout.
 *
 * ASSUMPTIONS (adjust to match your actual utils/economy.js and db/index.js):
 *   - economy.js exports:  addBalance(userId, guildId, amount)
 *   - db/index.js exports: db (a Turso client) — used here only if you want
 *     to persist "highest level rewarded" so restarts don't cause re-awards.
 *     If your xp.js already only fires on the exact level-up moment (not on
 *     every message), you can skip the DB check entirely — see NOTE below.
 *
 * HOW TO WIRE IT IN:
 *   In whatever function currently detects "user just leveled up" (likely
 *   inside utils/xp.js, called from events/messageCreate.js), import this
 *   and call it right after you compute the new level:
 *
 *     const { checkLevelRewards } = require('./levelRewards');
 *     ...
 *     if (newLevel > oldLevel) {
 *       await checkLevelRewards(message.member, newLevel, message.channel);
 *     }
 */

const { addBalance } = require('./economy'); // adjust path/name if different

// Edit this table to whatever makes sense for your server(s).
// role: exact role name to auto-assign (bot needs Manage Roles + role position above it)
// coins: economy payout on hitting this level
const LEVEL_REWARDS = {
  5:  { role: 'Regular',      coins: 100 },
  10: { role: 'Trusted',      coins: 250 },
  20: { role: 'Veteran',      coins: 500 },
  30: { role: 'Elite',        coins: 1000 },
  50: { role: 'Legend',       coins: 2500 },
};

async function checkLevelRewards(member, newLevel, announceChannel) {
  const reward = LEVEL_REWARDS[newLevel];
  if (!reward) return; // no reward tier at this exact level

  const results = [];

  // --- Role reward ---
  if (reward.role) {
    try {
      const role = member.guild.roles.cache.find(r => r.name === reward.role);
      if (role && !member.roles.cache.has(role.id)) {
        await member.roles.add(role);
        results.push(`the **${role.name}** role`);
      }
    } catch (err) {
      console.error(`[levelRewards] Failed to assign role for level ${newLevel}:`, err);
    }
  }

  // --- Coin reward ---
  if (reward.coins) {
    try {
      await addBalance(member.id, member.guild.id, reward.coins);
      results.push(`**${reward.coins}** coins`);
    } catch (err) {
      console.error(`[levelRewards] Failed to add coins for level ${newLevel}:`, err);
    }
  }

  // --- Announce ---
  if (results.length && announceChannel) {
    announceChannel.send(
      `🎉 ${member} just hit **Level ${newLevel}** and earned ${results.join(' + ')}!`
    ).catch(() => {});
  }
}

module.exports = { checkLevelRewards, LEVEL_REWARDS };
