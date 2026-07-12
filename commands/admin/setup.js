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
    
    // 🔍 LOG: Confirm we received the command
    console.log(`[SETUP] Received prompt from ${interaction.user.tag}: "${prompt}"`);
    
    await interaction.deferReply();
    
    try {
      // 🔍 LOG: About to call AI
      console.log(`[SETUP] Calling NVIDIA AI API...`);
      
      const result = await runAiSetup(prompt, interaction.guild, interaction.channelId);
      
      // 🔍 LOG: AI responded successfully
      console.log(`[SETUP] Success! Result:`, result.substring(0, 100) + '...');
      
      await interaction.editReply(result);
      
    } catch (error) {
      // 🔍 LOG: Something went wrong
      console.error(`[SETUP ERROR]`, error.message);
      console.error(error.stack);
      
      await interaction.editReply({
        content: ` Setup failed: ${error.message}`,
        ephemeral: true // Only you can see this error
      });
    }
  },
};
