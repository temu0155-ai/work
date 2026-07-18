const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getLeaderboard } = require('../../utils/xp');

const MEDALS = ['🥇', '🥈', '🥉'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('See the top members by level in this server'),

  async execute(interaction) {
    await interaction.deferReply();

    const rows = await getLeaderboard(interaction.guild.id, 10);

    if (!rows.length) {
      await interaction.editReply('No one has earned any XP yet — send a message or hop in voice!');
      return;
    }

    const lines = await Promise.all(
      rows.map(async (row, i) => {
        const member = await interaction.guild.members.fetch(row.user_id).catch(() => null);
        const name = member ? member.displayName : `Unknown user (${row.user_id})`;
        const prefix = MEDALS[i] || `**${i + 1}.**`;
        return `${prefix} ${name} — Level ${row.level} (${row.xp} XP)`;
      })
    );

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`🏆 ${interaction.guild.name} Leaderboard`)
      .setDescription(lines.join('\n'));

    await interaction.editReply({ embeds: [embed] });
  },
};
