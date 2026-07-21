// events/chatReply.js
// Replies with an AI-generated response when someone @mentions the bot or DMs it.
const { Events } = require('discord.js');
const reply = await generateChatReply(message.channelId, prompt, message.author.displayName, message.author.id);

module.exports = {
  name: Events.MessageCreate,
  once: false,
  async execute(message, client) {
    if (message.author.bot) return;

    const isMentioned = client.user && message.mentions.has(client.user);
    const isDM = !message.guild;
    if (!isMentioned && !isDM) return;

    const prompt = message.content.replace(/<@!?\d+>/g, '').trim();
    if (!prompt) return;

    try {
      await message.channel.sendTyping().catch(() => {});
      const reply = await generateChatReply(message.channelId, prompt);
      await message.reply(reply);
    } catch (err) {
      console.error('[chatReply] Failed to generate/send reply:', err);
    }
  },
};
