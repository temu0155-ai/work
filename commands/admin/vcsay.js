const { SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('vcsay')
        .setDescription('Make the bot say exactly what you type out loud in your VC.')
        .addStringOption(option =>
            option.setName('text')
                .setDescription('The exact words the bot should speak')
                .setRequired(true)),

    async execute(interaction) {
        const voiceChannel = interaction.member.voice.channel;

        if (!voiceChannel) {
            return interaction.reply({ content: '❌ Join a voice channel first to use this.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true }); // Kept private so you can shadow-drop audio lines
        const textToSpeak = interaction.options.getString('text');

        try {
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: interaction.guildId,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            });

            const player = createAudioPlayer();
            const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=tw-ob&q=${encodeURIComponent(textToSpeak)}`;
            const resource = createAudioResource(ttsUrl);

            player.play(resource);
            connection.subscribe(player);

            await interaction.editReply(`✨ Sent audio phrase to channel: "${textToSpeak}"`);

            player.on(AudioPlayerStatus.Idle, () => {
                setTimeout(() => {
                    if (connection.state.status !== 'Destroyed') {
                        connection.destroy();
                    }
                }, 3000);
            });

        } catch (error) {
            console.error('Error executing /vcsay command:', error);
            await interaction.editReply('⚠️ Audio stream initialization broke.');
        }
    },
};
