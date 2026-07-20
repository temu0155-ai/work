// commands/admin/voiceai.js
const { SlashCommandBuilder } = require('discord.js');
const { generateChatReply } = require('../../utils/persona');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('voiceai')
        .setDescription('Talk directly with the twin AI.')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Your message or question')
                .setRequired(true)),

    async execute(interaction) {
        // Give the API time to respond
        await interaction.deferReply();
        
        const prompt = interaction.options.getString('message');
        
        try {
            // Reuses the exact channel memory and persona from utils/persona.js
            const reply = await generateChatReply(interaction.channelId, prompt);
            
            // Discord character cap enforcement
            if (reply.length > 2000) {
                return interaction.editReply(reply.substring(0, 1990) + '...');
            }
            
            await interaction.editReply(reply);
        } catch (error) {
            console.error('Error executing /voiceai command:', error);
            await interaction.editReply('⚠️ Hit a snag trying to reach the AI. Let Kilo check the logs.');
        }
    },
};
