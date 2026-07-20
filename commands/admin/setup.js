const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { runAiSetup } = require('../../ai-tools');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Use AI to set up your server')
    .addStringOption((option) =>
      option.setName('prompt').setDescription('Describe what you want').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    const prompt = interaction.options.getString('prompt');
    console.log(`[SETUP] Received prompt from ${interaction.user.tag}: "${prompt}"`);

    try {
      await interaction.deferReply();
    } catch (deferError) {
      // Interaction already expired (3s window missed) — nothing we send
      // back will reach the user, so log and bail instead of crashing.
      console.error('[SETUP] deferReply failed — interaction likely expired:', deferError.message);
      return;
    }

    try {
      console.log(`[SETUP] Calling Groq AI API...`);
      const result = await runAiSetup(prompt, interaction.guild, interaction.channelId, interaction.member);
      console.log(`[SETUP] Success! Result:`, result.substring(0, 100) + '...');
      await interaction.editReply(result);
    } catch (error) {
      console.error(`[SETUP ERROR]`, error.message);
      console.error(error.stack);
      try {
        await interaction.editReply({ content: `Setup failed: ${error.message}` });
      } catch (replyError) {
        console.error('[SETUP] Could not send error back to Discord:', replyError.message);
      }
    }
  },
};
