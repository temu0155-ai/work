// events/wordFilter.js
const { Events } = require('discord.js');
const { containsBannedWord } = require('../utils/wordFilter');

module.exports = {
  name: Events.MessageCreate,
  once: false,
  async execute(message) {
    if (message.author.bot || !message.guild) return;

    if (containsBannedWord(message.content)) {
      message.channel.send(`Hey ${message.author}, let's keep it respectful in here 👀`).catch(() => {});
    }
  },
};
