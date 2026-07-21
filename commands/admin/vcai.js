cconst { SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection, createAudioPlayer, createAudioResource, StreamType } = require('@discordjs/voice');
const { generateResponse } = require('../../utils/persona');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

// ---- axis's voice: free Microsoft Edge neural TTS, no API key needed ----
// Other good female voices: en-US-JennyNeural, en-US-AnaNeural, en-GB-SoniaNeural, en-US-AvaNeural
const AXIS_VOICE = process.env.TTS_VOICE || 'en-US-AriaNeural';
const tts = new MsEdgeTTS();
let ttsReady = null;
function getTTS() {
  if (!ttsReady) ttsReady = tts.setMetadata(AXIS_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  return ttsReady;
}

const guildPlayers = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vcai')
    .setDescription('Talk to axis in voice chat')
    .addStringOption((option) =>
      option.setName('message').setDescription('What you wanna say to her').setRequired(true)
    ),

  async execute(interaction) {
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) return interaction.reply({ content: 'join a VC first, bru.', ephemeral: true });

    await interaction.deferReply();
    const prompt = interaction.options.getString('message');

    try {
      // 1. axis thinks — AI Horde + persona + gf dynamic (soft for kilo), short punchy voice line
      const aiTextReply = await generateResponse(interaction.user.id, prompt, interaction.member.displayName);

      // show what she said in chat too
      await interaction.editReply(`🗣️ **axis:** "${aiTextReply}"`);

      // 2. join (or reuse) the voice connection
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

      // 3. text -> speech (free edge-tts) -> play it in VC
      await getTTS();
      const audioStream = tts.toStream(aiTextReply);
      const resource = createAudioResource(audioStream, { inputType: StreamType.Arbitrary });
      player.play(resource);

    } catch (error) {
      console.error('[vcai]', error);
      await interaction.editReply(`voice brain hiccup: ${error.message}`).catch(() => {});
    }
  },
};
