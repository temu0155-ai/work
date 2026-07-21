const { SlashCommandBuilder } = require('discord.js');
const { generateResponse } = require('../../utils/persona');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vcai')
    .setDescription('Talk to axis (text reply)')
    .addStringOption((option) =>
      option.setName('message').setDescription('What you wanna say to her').setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const prompt = interaction.options.getString('message');

    try {
      const aiTextReply = await generateResponse(interaction.user.id, prompt, interaction.member.displayName);
      await interaction.editReply(`🗣️ **axis:** "${aiTextReply}"`);
    } catch (error) {
      console.error('[vcai]', error);
      await interaction.editReply(`⚠️ axis had a moment: ${error.message || 'unknown error'}`).catch(() => {});
    }
  },
};
   // Fallback voice
   const VOICE = process.env.TTS_VOICE || 'en-US-AriaNeural';

   // Text-to-speech (pure JS, no external calls)
   const say = require('say.js');
   function getTTS() {
     // No init needed — it's self-contained
   }
   function ttsToStream(text) {
     return say.speak(text, VOICE);
   }

// 100% reliable error-to-string converter (handles literally anything)
function safeError(e) {
  if (e == null) return 'null or undefined';
  if (typeof e === 'string') return e;
  if (e instanceof Error) {
    return e.message ? `${e.message} (${e.stack?.split('\n')[0] || 'no stack'})` : 'Error with no message';
  }
  try { return JSON.stringify(e, Object.getOwnPropertyNames(e)); } catch {}
  return String(e);
}

// Initialize TTS with fallback
let ttsReady = null;
function getTTS(voice = FALLBACK_VOICE) {
  if (!ttsReady) {
    try {
      ttsReady = tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    } catch (e) {
      console.error('[vcai] TTS init failed:', safeError(e));
      // Fallback to default voice
      ttsReady = tts.setMetadata(FALLBACK_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    }
  }
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
    let stage = 'init';
    let aiTextReply = '';

    try {
      // 1. axis thinks (Horde + persona + gf dynamic)
      stage = 'think';
      aiTextReply = await generateResponse(interaction.user.id, prompt, interaction.member.displayName);
      stage = 'reply-text';
      await interaction.editReply(`🗣️ **axis:** "${aiTextReply}"`);

      // 2. join VC connection
      stage = 'join';
      let connection = getVoiceConnection(interaction.guildId);
      if (!connection) {
        connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: interaction.guildId,
          adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });
        connection.on('error', (err) => console.error('[vcai] connection error:', safeError(err)));
      }

      // 3. wait for connection to be ready
      stage = 'wait-ready';
      await entersState(connection, VoiceConnectionStatus.Ready, 15000);

      // 4. setup audio player
      stage = 'player';
      let player = guildPlayers.get(interaction.guildId);
      if (!player) {
        player = createAudioPlayer();
        connection.subscribe(player);
        guildPlayers.set(interaction.guildId, player);
      }

      // 5. text-to-speech
      stage = 'tts';
      await getTTS(); // Will auto-fallback if needed
      stage = 'tts-stream';
      let audioStream;
      try {
        audioStream = tts.toStream(aiTextReply);
        // Some versions return a promise
        if (audioStream && typeof audioStream.then === 'function') {
          audioStream = await audioStream;
        }
      } catch (e) {
        console.error('[vcai] TTS stream failed:', safeError(e));
        // Fallback: try again with default voice
        await getTTS(FALLBACK_VOICE);
        audioStream = tts.toStream(aiTextReply);
        if (audioStream && typeof audioStream.then === 'function') {
          audioStream = await audioStream;
        }
      }

      // 6. play in VC
      stage = 'play';
      const resource = createAudioResource(audioStream, { inputType: StreamType.Arbitrary });
      player.play(resource);

    } catch (error) {
      const detail = safeError(error);
      console.error(`[vcai] failed at [${stage}]:`, detail);
      const text = aiTextReply ? `🗣️ **axis:** "${aiTextReply}"\n\n` : '';
      await interaction.editReply(`${text}⚠️ voice died at **[${stage}]**: ${detail}`).catch(() => {});
    }
  },
};
