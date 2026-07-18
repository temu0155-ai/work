const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, ensureUser, getRankPosition, xpForLevel } = require('../../utils/xp');

function progressBar(current, total, length = 20) {
  const filled = Math.round((current / total) * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Check your (or someone else\'s) level and XP')
    .addUserOption((option) =>
      option.setName('user').setDescription('Whose rank to check').setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;

    await ensureUser(interaction.guild.id, target.id);
    const user = await getUser(interaction.guild.id, target.id);
    const rank = await getRankPosition(interaction.guild.id, target.id);
    const needed = xpForLevel(Number(user.level));

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({ name: target.username, iconURL: target.displayAvatarURL() })
      .setTitle(`Rank #${rank}`)
      .addFields(
        { name: 'Level', value: `${user.level}`, inline: true },
        { name: 'XP', value: `${user.xp} / ${needed}`, inline: true },
        { name: 'Messages', value: `${user.messages}`, inline: true },
        { name: 'Voice time', value: `${Math.floor(user.voice_minutes)} min`, inline: true }
      )
      .setDescription(`${progressBar(Number(user.xp), needed)}`);

    await interaction.reply({ embeds: [embed] });
  },
};
