const { SlashCommandBuilder } = require('discord.js');
const {
  joinVoiceChannel, getVoiceConnection, createAudioPlayer, createAudioResource,
  StreamType, VoiceConnectionStatus, entersState,
} = require('@discordjs/voice');
const { generateResponse } = require('../../utils/persona');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

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
      // axis thinks (Horde + persona + gf dynamic), short punchy voice line
      const aiTextReply = await generateResponse(interaction.user.id, prompt, interaction.member.displayName);
      await interaction.editReply(`🗣️ **axis:** "${aiTextReply}"`);

      // join (or reuse) the voice connection
      let connection = getVoiceConnection(interaction.guildId);
      if (!connection) {
        connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: interaction.guildId,
          adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });
        // log the REAL reason if the connection dies
        connection.on('error', (err) =>
          console.error('[vcai] voice connection error:', err?.message || JSON.stringify(err))
        );
      }

      // wait until the connection is actually Ready (surfaces the real failure if it can't connect)
      try {
        await entersState(connection, VoiceConnectionStatus.Ready, 15000);
      } catch (e) {
        console.error('[vcai] connection never became Ready:', e?.message || JSON.stringify(e));
        return interaction.followUp("couldn't join VC — check the Railway logs for the real reason.").catch(() => {});
      }

      let player = guildPlayers.get(interaction.guildId);
      if (!player) {
        player = createAudioPlayer();
        connection.subscribe(player);
        guildPlayers.set(interaction.guildId, player);
      }

      // text -> speech -> play in VC
      await getTTS();
      const audioStream = tts.toStream(aiTextReply);
      const resource = createAudioResource(audioStream, { inputType: StreamType.Arbitrary });
      player.play(resource);

    } catch (error) {
      console.error('[vcai] execute error:', error?.message || error);
      await interaction.editReply(`voice brain hiccup: ${error?.message || error}`).catch(() => {});
    }
  },
};
