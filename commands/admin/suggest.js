/**
 * commands/utility/suggest.js
 *
 * /suggest <idea> — posts an embed to a suggestions channel with 👍/👎
 * voting reactions. Anonymous-ish (shows submitter, but no threading of
 * who voted which way beyond Discord's own reaction UI).
 *
 * SETUP:
 *   1. Create a #suggestions channel in your server, grab its ID.
 *   2. Set SUGGESTIONS_CHANNEL_ID below, or better, put it in your .env
 *      as SUGGESTIONS_CHANNEL_ID and read it via process.env.
 *   3. Register this command the same way your other commands/ files are
 *      picked up by deploy-commands.js (no changes needed there if it
 *      already walks the commands/ folder recursively).
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const SUGGESTIONS_CHANNEL_ID = process.env.SUGGESTIONS_CHANNEL_ID || 'PUT_CHANNEL_ID_HERE';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('Submit a suggestion for the server')
    .addStringOption(option =>
      option
        .setName('idea')
        .setDescription('What do you want to suggest?')
        .setRequired(true)
        .setMaxLength(1000)
    ),

  async execute(interaction) {
    const idea = interaction.options.getString('idea');

    const channel = interaction.guild.channels.cache.get(SUGGESTIONS_CHANNEL_ID);
    if (!channel) {
      return interaction.reply({
        content: '⚠️ Suggestions channel isn\'t configured yet — ask an admin to set `SUGGESTIONS_CHANNEL_ID`.',
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({
        name: interaction.user.tag,
        iconURL: interaction.user.displayAvatarURL(),
      })
      .setDescription(idea)
      .setFooter({ text: `Suggestion #${Date.now().toString().slice(-6)}` })
      .setTimestamp();

    const suggestionMsg = await channel.send({ embeds: [embed] });
    await suggestionMsg.react('👍');
    await suggestionMsg.react('👎');

    await interaction.reply({
      content: `✅ Suggestion posted in ${channel}!`,
      ephemeral: true,
    });
  },
};

/**
 * OPTIONAL: commands/admin/setsuggestions.js
 * A quick admin command to set the channel without touching .env, if you'd
 * rather store it in Turso per-guild (recommended if this bot runs on
 * multiple servers). Ask me if you want that version — it needs a small
 * table in db/index.js (guild_id, suggestions_channel_id).
 */
