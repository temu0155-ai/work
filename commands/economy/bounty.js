// commands/economy/bounty.js
//
// /bounty put <target> <amount> [duration]  — put coins on someone's head
// /bounty list                              — most-wanted leaderboard
// /bounty check <target>                    — see the bounty on one person
//
// Claiming isn't a subcommand here — it happens automatically inside
// rob.js when a robbery succeeds against a wanted target.

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { MIN_BOUNTY, addBounty, getBounty, getActiveBounties } = require('../../utils/bounty');

const DURATION_CHOICES = [
  { name: '6 hours', value: 6 },
  { name: '12 hours', value: 12 },
  { name: '24 hours', value: 24 },
  { name: '48 hours', value: 48 },
];

const BOUNTY_COLOR = 0xe67e22;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bounty')
    .setDescription("Put a price on someone's head, or check who's wanted")
    .addSubcommand(sub =>
      sub
        .setName('put')
        .setDescription(`Place a bounty on a member (min ${MIN_BOUNTY} coins)`)
        .addUserOption(o => o.setName('target').setDescription('Who to put a bounty on').setRequired(true))
        .addIntegerOption(o =>
          o.setName('amount').setDescription('Coins to put up').setRequired(true).setMinValue(MIN_BOUNTY)
        )
        .addIntegerOption(o =>
          o
            .setName('duration')
            .setDescription('How long the bounty stays active (default 24h)')
            .setRequired(false)
            .addChoices(...DURATION_CHOICES)
        )
    )
    .addSubcommand(sub => sub.setName('list').setDescription('Show the current most-wanted list'))
    .addSubcommand(sub =>
      sub
        .setName('check')
        .setDescription('Check the bounty on a specific member')
        .addUserOption(o => o.setName('target').setDescription('Who to check').setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'put') {
      const target = interaction.options.getUser('target');
      const amount = interaction.options.getInteger('amount');
      const durationHours = interaction.options.getInteger('duration') || 24;

      if (target.id === interaction.user.id) {
        return interaction.reply({ content: "You can't put a bounty on yourself.", ephemeral: true });
      }
      if (target.bot) {
        return interaction.reply({ content: "Bots don't bleed. Pick a real target.", ephemeral: true });
      }

      const result = await addBounty(
        guildId,
        target.id,
        interaction.user.id,
        amount,
        durationHours * 60 * 60 * 1000
      );

      if (!result.ok) {
        return interaction.reply({
          content: `You only have **${result.balance}** coins — you need at least **${amount}** to put up that bounty.`,
          ephemeral: true,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(BOUNTY_COLOR)
        .setTitle('🎯 WANTED')
        .setDescription(
          `${interaction.user} put **${amount} coins** on ${target}'s head!\n\n` +
            `**Total bounty: ${result.bounty.totalAmount} coins**\n` +
            `Expires <t:${Math.floor(result.bounty.expiresAt / 1000)}:R>\n\n` +
            `Whoever successfully \`/rob\`s ${target.username} first claims the full pot.`
        );

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'check') {
      const target = interaction.options.getUser('target');
      const bounty = await getBounty(guildId, target.id);

      if (!bounty) {
        return interaction.reply({ content: `No active bounty on ${target.username}.`, ephemeral: true });
      }

      const contributorList = bounty.contributors
        .sort((a, b) => b.amount - a.amount)
        .map(c => `<@${c.contributorId}>: ${c.amount}`)
        .join('\n');

      const embed = new EmbedBuilder()
        .setColor(BOUNTY_COLOR)
        .setTitle(`🎯 Bounty on ${target.username}`)
        .setDescription(
          `**Total: ${bounty.totalAmount} coins**\n` +
            `Expires <t:${Math.floor(bounty.expiresAt / 1000)}:R>\n\n` +
            `**Contributors:**\n${contributorList}`
        );

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'list') {
      const bounties = await getActiveBounties(guildId, 10);

      if (!bounties.length) {
        return interaction.reply('No active bounties right now. Be the first to put one up with `/bounty put`.');
      }

      const lines = bounties.map(
        (b, i) =>
          `**${i + 1}.** <@${b.targetId}> — **${b.totalAmount}** coins (expires <t:${Math.floor(
            b.expiresAt / 1000
          )}:R>)`
      );

      const embed = new EmbedBuilder().setColor(BOUNTY_COLOR).setTitle('🎯 Most Wanted').setDescription(lines.join('\n'));

      return interaction.reply({ embeds: [embed] });
    }
  },
};
