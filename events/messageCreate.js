const { Events } = require('discord.js');
const { addMessageXp } = require('../utils/xp');
const { checkLevelRewards } = require('../utils/levelRewards');

module.exports = {
  name: Events.MessageCreate,
  once: false,
  async execute(message) {
    if (message.author.bot || !message.guild) return;

    try {
      const result = await addMessageXp(message.guild.id, message.author.id);
      if (result?.leveledUp) {
        message.channel
          .send(`🎉 ${message.author} just reached **level ${result.level}**!`)
          .catch(() => {}); // don't crash if the bot lacks send perms in this channel

        await checkLevelRewards(message.member, result.oldLevel, result.level, message.channel);
      }
    } catch (err) {
      console.error('[xp] Failed to award message XP:', err);
    }
  },
};
