const { SlashCommandBuilder } = require('discord.js');
const {
  joinVoiceChannel,
  getVoiceConnection,
  EndBehaviorType,
} = require('@discordjs/voice');
const prism = require('prism-media');
const fs = require('fs');
const path = require('path');
const { nodewhisper } = require('nodejs-whisper');

const CAPTURE_DIR = path.join(__dirname, '../../captures');
if (!fs.existsSync(CAPTURE_DIR)) fs.mkdirSync(CAPTURE_DIR, { recursive: true });

// Whisper model — tiny.en is fastest, good enough to prove the pipeline works.
// Bump to 'base.en' later if accuracy is too rough.
const WHISPER_MODEL = process.env.WHISPER_MODEL || 'tiny.en';

// Minimal WAV header writer — turns raw 48kHz stereo 16-bit PCM into a valid .wav file.
function pcmToWav(pcmBuffer, sampleRate = 48000, channels = 2, bitDepth = 16) {
  const byteRate = (sampleRate * channels * bitDepth) / 8;
  const blockAlign = (channels * bitDepth) / 8;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

async function transcribe(wavPath) {
  const result = await nodewhisper(wavPath, {
    modelName: WHISPER_MODEL,
    autoDownloadModelName: WHISPER_MODEL, // auto-downloads the model on first run
    whisperOptions: {
      outputInText: false,
      language: 'en',
    },
  });
  return String(result || '').trim();
}

function startListeningToUser(connection, userId) {
  const receiver = connection.receiver;

  const opusStream = receiver.subscribe(userId, {
    end: { behavior: EndBehaviorType.AfterSilence, duration: 1000 },
  });

  const decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
  const chunks = [];

  opusStream.pipe(decoder);
  decoder.on('data', (chunk) => chunks.push(chunk));

  decoder.on('end', async () => {
    const pcmBuffer = Buffer.concat(chunks);
    if (pcmBuffer.length < 4800) return; // too short (< ~50ms), skip noise/mic-taps

    const wavBuffer = pcmToWav(pcmBuffer);
    const wavPath = path.join(CAPTURE_DIR, `${userId}-${Date.now()}.wav`);
    fs.writeFileSync(wavPath, wavBuffer);
    console.log(`[vclisten] saved: ${wavPath}, transcribing...`);

    try {
      const text = await transcribe(wavPath);
      console.log(`[vclisten] transcribed: "${text}"`);
    } catch (err) {
      console.error('[vclisten] transcription error:', err.message);
    } finally {
      fs.unlink(wavPath, () => {}); // clean up after ourselves
    }
  });

  opusStream.on('error', (err) => console.error('[vclisten] opus stream error:', err.message));
  decoder.on('error', (err) => console.error('[vclisten] decoder error:', err.message));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vclisten')
    .setDescription('Phase 2 test: axis joins VC, listens, and transcribes what you say'),
  async execute(interaction) {
    await interaction.deferReply();
    const voiceChannel = interaction.member?.voice?.channel;
    const guildId = interaction.guild?.id;

    if (!voiceChannel || !guildId) {
      return interaction.editReply('you gotta be in a voice channel first.');
    }

    let connection = getVoiceConnection(guildId);
    if (!connection || connection.joinConfig.channelId !== voiceChannel.id) {
      connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: false,
      });
    }

    const userId = interaction.user.id;
    connection.receiver.speaking.on('start', (speakingUserId) => {
      if (speakingUserId !== userId) return;
      startListeningToUser(connection, speakingUserId);
    });

    await interaction.editReply(
      `listening now — say something in VC, then check Railway logs for the transcription.`
    );
  },
};
