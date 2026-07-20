const { SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection, createAudioPlayer, createAudioResource, StreamType } = require('@discordjs/voice');
const { generateResponse } = require('../../utils/persona');
const OpenAI = require('openai');
const { Readable } = require('stream');

// Client auf DeepInfra zeigen (Uncensored Provider)
const aiClient = new OpenAI({
    baseURL: "https://api.deepinfra.com/v1/openai",
    apiKey: process.env.DEEPINFRA_API_KEY, // Setz das in Railway!
});

const guildPlayers = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('vcai')
        .setDescription('Talk to the AI.')
        .addStringOption(option => option.setName('message').setDescription('Message').setRequired(true)),

    async execute(interaction) {
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) return interaction.reply({ content: 'Join VC first.', ephemeral: true });

        await interaction.deferReply();
        const prompt = interaction.options.getString('message');

        try {
            // 1. Uncensored Response von DeepInfra holen
            // Wir überschreiben hier kurz die Standard-Logik für maximale Freiheit
            const response = await aiClient.chat.completions.create({
                model: "cognitivecomputations/dolphin-2.9-llama3-8b", // Hier ist dein Uncensored Modell!
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7,
            });

            const aiTextReply = response.choices[0].message.content;

            // 2. Verbindung aufbauen
            let connection = getVoiceConnection(interaction.guildId);
            if (!connection) {
                connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: interaction.guildId,
                    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
                });
            }

            let player = guildPlayers.get(interaction.guildId);
            if (!player) {
                player = createAudioPlayer();
                connection.subscribe(player);
                guildPlayers.set(interaction.guildId, player);
            }

            // 3. WICHTIG: Die Speech API von Groq geht nicht.
            // Du brauchst hier einen anderen TTS Service. 
            // Wenn du "Free" bleiben willst, schau dir "ElevenLabs" (hat free tier)
            // oder "Google TTS" an. 
            // Hier ein Platzhalter für deine Logik:
            
            await interaction.editReply(`🗣️ **AI:** "${aiTextReply}"`);
            
            // Player.play(resource) würde hier folgen, sobald du einen TTS-Provider hast.

        } catch (error) {
            console.error(error);
            await interaction.editReply(`Error: ${error.message}`);
        }
    },
};
