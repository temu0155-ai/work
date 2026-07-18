const { SlashCommandBuilder } = require('discord.js');
const { claimDaily } = require('../../utils/economy');

function formatDuration(ms) {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m`;
}

module.exports = {
  data: new SlashCommandBuilder().setName('daily').setDescription('Claim your daily coins'),

  async execute(interaction) {
    const result = await claimDaily(interaction.guild.id, interaction.user.id);

    if (!result.claimed) {
      await interaction.reply({
        content: `Already claimed — come back in ${formatDuration(result.msRemaining)}.`,
        ephemeral: true,
      });
      return;
    }

    await interaction.reply(`💰 Claimed **${result.amount}** coins! Balance: **${result.newBalance}**.`);
  },
};
