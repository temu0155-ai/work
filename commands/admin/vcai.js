const { SlashCommandBuilder } = require('discord.js');
const { generateResponse } = require('../../utils/persona');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vcai')
    .setDescription('Talk to axis')
    .addStringOption(option => option.setName('message').setDescription('Message').setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply();
    const prompt = interaction.options.getString('message');
    try {
      const reply = await generateResponse(interaction.user.id, prompt, interaction.member.displayName);
      await interaction.editReply(`🗣️ **axis:** ${reply}`);
    } catch (err) {
      console.error(err);
      await interaction.editReply('axis is thinking too hard, try again.');
    }
  }
};
