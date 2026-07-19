/**
 * commands/economy/rob.js
 *
 * /rob @user — attempt to steal coins from another member.
 * This is the "crazy" one: real risk, real payout, public embarrassment
 * on failure. Built to generate chat drama, which is the point.
 *
 * Matches your actual utils/economy.js:
 *   - getBalance(guildId, userId)          -> number
 *   - addBalance(guildId, userId, amount)  -> adds (can be negative to subtract), clamped at 0
 *
 * MECHANIC:
 *   - Target must have at least MIN_TARGET_BALANCE coins, or robbing them
 *     isn't worth it (protects broke/new members from being farmed).
 *   - 45% success chance (tune SUCCESS_RATE).
 *   - Success: rob 10-30% of target's balance, capped at MAX_STEAL.
 *   - Fail: robber pays a FINE_PERCENT fine of their OWN balance to the
 *     target (poetic justice) or a flat fine if they're too broke.
 *   - Per-user cooldown (default 1 hour) stored in-memory; swap for Turso
 *     if you want it to survive restarts (recommended — see note below).
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBalance, addBalance } = require('../../utils/economy');

const SUCCESS_RATE = 0.45;
const MIN_TARGET_BALANCE = 50;
const STEAL_RANGE = [0.10, 0.30]; // 10%-30% of target's balance
const MAX_STEAL = 500;
const FINE_PERCENT = 0.15;
const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

// In-memory cooldown tracker: userId -> timestamp of last attempt.
// NOTE: resets on bot restart. For a persistent version, store last_rob_at
// in your Turso db keyed by (user_id, guild_id) instead — happy to write
// that variant if you want cooldowns to survive Railway redeploys.
const cooldowns = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rob')
    .setDescription('Attempt to rob another member. Risky.')
    .addUserOption(option =>
      option.setName('target').setDescription('Who to rob').setRequired(true)
    ),

  async execute(interaction) {
    const robber = interaction.user;
    const target = interaction.options.getUser('target');
    const guildId = interaction.guild.id;

    if (target.id === robber.id) {
      return interaction.reply({ content: "You can't rob yourself, genius.", ephemeral: true });
    }
    if (target.bot) {
      return interaction.reply({ content: "Bots don't carry cash.", ephemeral: true });
    }

    const now = Date.now();
    const last = cooldowns.get(robber.id) || 0;
    if (now - last < COOLDOWN_MS) {
      const remaining = Math.ceil((COOLDOWN_MS - (now - last)) / 60000);
      return interaction.reply({
        content: `🚨 Lay low — you can attempt another robbery in ${remaining} min.`,
        ephemeral: true,
      });
    }

    const targetBalance = await getBalance(guildId, target.id);
    if (targetBalance < MIN_TARGET_BALANCE) {
      return interaction.reply({
        content: `${target.username} is too broke to bother robbing. Find a richer target.`,
        ephemeral: true,
      });
    }

    const robberBalance = await getBalance(guildId, robber.id);
    cooldowns.set(robber.id, now);

    const success = Math.random() < SUCCESS_RATE;

    if (success) {
      const pct = STEAL_RANGE[0] + Math.random() * (STEAL_RANGE[1] - STEAL_RANGE[0]);
      const stolen = Math.min(Math.floor(targetBalance * pct), MAX_STEAL);

      await addBalance(guildId, target.id, -stolen);
      await addBalance(guildId, robber.id, stolen);

      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setDescription(`💰 **${robber.username}** successfully robbed **${target.username}** and got away with **${stolen} coins**!`);

      return interaction.reply({ embeds: [embed] });
    } else {
      const fine = Math.floor(robberBalance * FINE_PERCENT);
      const paid = Math.max(fine, 0);

      if (paid > 0) {
        await addBalance(guildId, robber.id, -paid);
        await addBalance(guildId, target.id, paid);
      }

      const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setDescription(
          paid > 0
            ? `🚔 **${robber.username}** got caught trying to rob **${target.username}** and had to pay a fine of **${paid} coins**!`
            : `🚔 **${robber.username}** got caught trying to rob **${target.username}** — luckily they had nothing to fine.`
        );

      return interaction.reply({ embeds: [embed] });
    }
  },
};
