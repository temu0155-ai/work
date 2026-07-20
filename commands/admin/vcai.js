const { SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const { generateResponse } = require('../../utils/persona');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('vcai')
        .setDescription('Talk to the twin AI and have him answer out loud in your VC.')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('What you want to say to the AI')
                .setRequired(true)),

    async execute(interaction) {
        const voiceChannel = interaction.member.voice.channel;
        
        // Security check: Make sure the user is actually in a VC
        if (!voiceChannel) {
            return interaction.reply({ content: '❌ You need to be in a voice channel first, bru.', ephemeral: true });
        }

        await interaction.deferReply();
        const prompt = interaction.options.getString('message');

        try {
            // Get the voice-optimized short response from your twin persona
            const aiTextReply = await generateResponse(interaction.user.id, prompt);

            // Establish connection to the voice channel
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: interaction.guildId,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            });

            const player = createAudioPlayer();
            
            // Generate standard URL-encoded text-to-speech stream (English locale matching the persona)
            const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=tw-ob&q=${encodeURIComponent(aiTextReply)}`;
            const resource = createAudioResource(ttsUrl);

            player.play(resource);
            connection.subscribe(player);

            // Edit the interaction reply so you can see what he's saying out loud
            await interaction.editReply(`🗣️ **AI in VC:** "${aiTextReply}"`);

            // Disconnect automatically once the bot finishes speaking to save resources
            player.on(AudioPlayerStatus.Idle, () => {
                setTimeout(() => {
                    if (connection.state.status !== 'Destroyed') {
                        connection.destroy();
                    }
                }, 5000); // Leaves 5 seconds of silence after talking before leaving
            });

        } catch (error) {
            console.error('Error executing /vcai command:', error);
            await interaction.editReply('⚠️ Failed to process VC audio. Check the bot terminal console.');
        }
    },
};
