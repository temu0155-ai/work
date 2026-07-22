// events/chatReply.js
// Triggers: @-mention in a server, OR any DM, OR any message in MIKASA_FREE_CHANNEL.
// The persona (cold/warm/RP) applies to all of them — this file only decides the trigger.
const { Events } = require('discord.js');
const { generateChatReply } = require('../utils/persona');

const FREE_CHANNEL = process.env.MIKASA_FREE_CHANNEL || ''; // set on Railway = a channel id

module.exports = {
  name: Events.MessageCreate,
  once: false,
  async execute(message, client) {
    if (message.author.bot) return;

    const isMentioned = client.user && message.mentions.has(client.user);
    const isDM = !message.guild;
    const isFreeChannel = !!FREE_CHANNEL && message.channelId === FREE_CHANNEL;
    if (!isMentioned && !isDM && !isFreeChannel) return; // silent unless one of the three

    const prompt = message.content.replace(/<@!?\d+>/g, '').trim();
    if (!prompt) return;

    try {
      await message.channel.sendTyping().catch(() => {});
      const reply = await generateChatReply(message.channelId, prompt, message.author.displayName, message.author.id);
      await message.reply(reply);
    } catch (err) {
      console.error('[chatReply] Failed to generate/send reply:', err);
    }
  },
};
