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
        // 1. Holt die AI-Antwort (inklusive funktionierender Konvo-Memory)
        const aiTextReply = await generateResponse(interaction.user.id, prompt);

        // 2. Verbindung stabil abgreifen oder neu aufbauen
        let connection = getVoiceConnection(interaction.guildId);
        if (!connection) {
            connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: interaction.guildId,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: false
            });
        }

        // 3. Player im Speicher cachen, damit der Bot NIEMALS leavt
        let player = guildPlayers.get(interaction.guildId);
        if (!player) {
            player = createAudioPlayer();
            connection.subscribe(player);
            guildPlayers.set(interaction.guildId, player);
            
            player.on('error', error => console.error('[Audio Error]:', error.message));
        }

        // 4. Audio direkt über die Groq-API streamen (Hannah Voice)
        const speechResponse = await groq.audio.speech.create({
            model: "canopylabs/orpheus-v1-english",
            voice: "hannah", 
            input: aiTextReply,
            response_format: "wav"
        });

        const buffer = Buffer.from(await speechResponse.arrayBuffer());
        const resource = createAudioResource(Readable.from(buffer), {
            inputType: StreamType.Arbitrary
        });

        player.play(resource);
        await interaction.editReply(`🗣️ **AI in VC:** "${aiTextReply}"`);

    } catch (error) {
        console.error('Error executing /vcai command:', error);
        await interaction.editReply(`⚠️ Audio-Pipeline fehlgeschlagen: ${error.message}`);
        }
  },
};