const { SlashCommandBuilder } = require('discord.js');
const {
  joinVoiceChannel,
  getVoiceConnection,
  EndBehaviorType,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
} = require('@discordjs/voice');
const prism = require('prism-media');
const fs = require('fs');
const path = require('path');
const { generateResponse } = require('../../utils/persona');
const { textToSpeechStream } = require('../../utils/tts');

const CAPTURE_DIR = path.join(__dirname, '../../captures');
if (!fs.existsSync(CAPTURE_DIR)) fs.mkdirSync(CAPTURE_DIR, { recursive: true });

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_STT_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

// One shared audio player per guild — reused so she doesn't rejoin every reply.
const players = new Map();
function getOrCreatePlayer(guildId) {
  let player = players.get(guildId);
  if (!player) {
    player = createAudioPlayer();
    players.set(guildId, player);
  }
  return player;
}

function pcmToWav(pcmBuffer, sampleRate = 48000, channels = 2, bitDepth = 16) {
  const byteRate = (sampleRate * channels * bitDepth) / 8;
  const blockAlign = (channels * bitDepth) / 8;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcmBuffer]);
}

async function transcribeWithGroq(wavPath) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY is not set');
  const form = new FormData();
  const fileBuffer = fs.readFileSync(wavPath);
  form.append('file', new Blob([fileBuffer], { type: 'audio/wav' }), path.basename(wavPath));
  form.append('model', 'whisper-large-v3-turbo');
  form.append('language', 'en');
  form.append('response_format', 'text');

  const res = await fetch(GROQ_STT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Groq STT failed (${res.status}): ${errText}`);
  }
  return (await res.text()).trim();
}

function startListeningToUser(connection, userId, displayName, guildId) {
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
    if (pcmBuffer.length < 4800) return; // too short — skip mic taps/noise

    const wavBuffer = pcmToWav(pcmBuffer);
    const wavPath = path.join(CAPTURE_DIR, `${userId}-${Date.now()}.wav`);
    fs.writeFileSync(wavPath, wavBuffer);

    try {
      const text = await transcribeWithGroq(wavPath);
      console.log(`[vclisten] heard: "${text}"`);

      if (!text || text.length < 2) return; // empty/junk transcription, skip

      // Feed what was heard into the full persona (warm/cold, kilo-check, etc.)
      const reply = await generateResponse(userId, text, displayName);
      console.log(`[vclisten] replying: "${reply}"`);

      const audioStream = await textToSpeechStream(reply);
      const resource = createAudioResource(audioStream);
      const player = getOrCreatePlayer(guildId);
      connection.subscribe(player);
      player.play(resource);
    } catch (err) {
      console.error('[vclisten] error:', err.message);
    } finally {
      fs.unlink(wavPath, () => {});
    }
  });

  opusStream.on('error', (err) => console.error('[vclisten] opus stream error:', err.message));
  decoder.on('error', (err) => console.error('[vclisten] decoder error:', err.message));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vclisten')
    .setDescription('Mikasa joins VC, listens, and talks back in character'),
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
        selfDeaf: false, // must hear audio
      });
    }

    const userId = interaction.user.id;
    const displayName = interaction.member.displayName;

    connection.receiver.speaking.on('start', (speakingUserId) => {
      if (speakingUserId !== userId) return; // only the command user, for now
      startListeningToUser(connection, speakingUserId, displayName, guildId);
    });

    await interaction.editReply(`listening now — just talk, she'll respond in VC.`);
  },
};
