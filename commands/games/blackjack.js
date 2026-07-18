const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { freshDeck, handTotal, formatHand, isBlackjack, playDealer, resolveOutcome } = require('../../utils/blackjack');
const { getBalance, addBalance } = require('../../utils/economy');

const activeGames = new Map();

const OUTCOME_TEXT = {
  player_blackjack: (bet) => ({ text: `🂡 Blackjack! You win **${Math.floor(bet * 1.5)}** coins.`, payout: Math.floor(bet * 1.5) }),
  player_bust: () => ({ text: '💥 Bust — you lose.', payout: -1 }),
  dealer_bust: (bet) => ({ text: `🎉 Dealer busts — you win **${bet}** coins!`, payout: bet }),
  player_win: (bet) => ({ text: `✅ You win **${bet}** coins!`, payout: bet }),
  dealer_win: () => ({ text: '❌ Dealer wins — you lose.', payout: -1 }),
  push: () => ({ text: "🤝 Push — bet's back.", payout: 0 }),
};

function buildEmbed(game, revealDealer) {
  const dealerDisplay = revealDealer
    ? `${formatHand(game.dealerHand)} (${handTotal(game.dealerHand)})`
    : `${game.dealerHand[0].rank}${game.dealerHand[0].suit} ❓`;

  return new EmbedBuilder()
    .setColor(0x2b6cb0)
    .setTitle('🃏 Blackjack')
    .addFields(
      { name: 'Your hand', value: `${formatHand(game.playerHand)} (${handTotal(game.playerHand)})` },
      { name: "Dealer's hand", value: dealerDisplay }
    )
    .setFooter({ text: `Bet: ${game.bet} coins` });
}

function buildButtons(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bj_hit').setLabel('Hit').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('bj_stand').setLabel('Stand').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
  );
}

async function settleGame(interaction, game, outcome) {
  const { text, payout } = OUTCOME_TEXT[outcome](game.bet);
  const actualPayout = payout === -1 ? -game.bet : payout;
  const newBalance = await addBalance(interaction.guild.id, interaction.user.id, actualPayout);
  activeGames.delete(interaction.user.id);

  const embed = buildEmbed(game, true).setDescription(`${text}\nBalance: **${newBalance}** coins`);
  await interaction.update({ embeds: [embed], components: [buildButtons(true)] });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('Play a round of blackjack against the dealer')
    .addIntegerOption((option) =>
      option.setName('bet').setDescription('How many coins to bet').setRequired(true).setMinValue(1)
    ),

  async execute(interaction) {
    if (activeGames.has(interaction.user.id)) {
      await interaction.reply({ content: 'Finish your current game first!', ephemeral: true });
      return;
    }

    const bet = interaction.options.getInteger('bet');
    const balance = await getBalance(interaction.guild.id, interaction.user.id);
    if (bet > balance) {
      await interaction.reply({ content: `You've only got **${balance}** coins.`, ephemeral: true });
      return;
    }

    const deck = freshDeck();
    const game = {
      bet,
      deck,
      playerHand: [deck.pop(), deck.pop()],
      dealerHand: [deck.pop(), deck.pop()],
    };
    activeGames.set(interaction.user.id, game);

    if (isBlackjack(game.playerHand)) {
      const outcome = isBlackjack(game.dealerHand) ? 'push' : 'player_blackjack';
      await interaction.reply({ embeds: [buildEmbed(game, true)], components: [buildButtons(true)] });
      const { text, payout } = OUTCOME_TEXT[outcome](bet);
      const actualPayout = payout === -1 ? -bet : payout;
      const newBalance = await addBalance(interaction.guild.id, interaction.user.id, actualPayout);
      activeGames.delete(interaction.user.id);
      await interaction.editReply({
        embeds: [buildEmbed(game, true).setDescription(`${text}\nBalance: **${newBalance}** coins`)],
      });
      return;
    }

    const reply = await interaction.reply({
      embeds: [buildEmbed(game, false)],
      components: [buildButtons(false)],
      fetchReply: true,
    });

    const collector = reply.createMessageComponentCollector({ time: 60_000 });

    collector.on('collect', async (btnInteraction) => {
      if (btnInteraction.user.id !== interaction.user.id) {
        await btnInteraction.reply({ content: "This isn't your game!", ephemeral: true });
        return;
      }

      const current = activeGames.get(interaction.user.id);
      if (!current) return;

      if (btnInteraction.customId === 'bj_hit') {
        current.playerHand.push(current.deck.pop());
        const total = handTotal(current.playerHand);

        if (total > 21) {
          await settleGame(btnInteraction, current, 'player_bust');
          collector.stop();
          return;
        }

        await btnInteraction.update({ embeds: [buildEmbed(current, false)], components: [buildButtons(false)] });
        return;
      }

      if (btnInteraction.customId === 'bj_stand') {
        playDealer(current.deck, current.dealerHand);
        const outcome = resolveOutcome(current.playerHand, current.dealerHand);
        await settleGame(btnInteraction, current, outcome);
        collector.stop();
      }
    });

    collector.on('end', (_collected, reason) => {
      if (reason === 'time' && activeGames.has(interaction.user.id)) {
        activeGames.delete(interaction.user.id);
        interaction.editReply({ components: [buildButtons(true)] }).catch(() => {});
      }
    });
  },
};
