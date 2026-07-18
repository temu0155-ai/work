const { SlashCommandBuilder } = require('discord.js');
const { getBalance } = require('../../utils/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check how many coins you\'ve got')
    .addUserOption((option) =>
      option.setName('user').setDescription('Whose balance to check').setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    const balance = await getBalance(interaction.guild.id, target.id);
    const you = target.id === interaction.user.id;
    await interaction.reply(`${you ? "You've" : `${target.username} has`} got **${balance}** coins.`);
  },
};
