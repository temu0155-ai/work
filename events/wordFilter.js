// events/wordFilter.js
const { Events } = require('discord.js');
const { containsBannedWord } = require('../utils/wordFilter');

const MOD_LOG_CHANNEL_ID = '1465376570674905367';
const flagCounts = new Map(); // userId -> count, in-memory (resets on restart)

module.exports = {
  name: Events.MessageCreate,
  once: false,
  async execute(message, client) {
    if (message.author.bot || !message.guild) return;
    if (!containsBannedWord(message.content)) return;

    const count = (flagCounts.get(message.author.id) || 0) + 1;
    flagCounts.set(message.author.id, count);

    const logChannel = client.channels.cache.get(MOD_LOG_CHANNEL_ID);
    if (logChannel) {
      logChannel
        .send(`⚠️ ${message.author} flagged in ${message.channel} — total: **${count}**`)
        .catch((err) => console.error('[wordFilter] Failed to send mod log:', err));
    } else {
      console.warn(`[wordFilter] Mod log channel ${MOD_LOG_CHANNEL_ID} not found or bot lacks access.`);
    }
  },
};
