const { SlashCommandBuilder } = require('discord.js');
const {
  joinVoiceChannel,
  getVoiceConnection,
  EndBehaviorType,
} = require('@discordjs/voice');
const prism = require('prism-media');
const fs = require('fs');
const path = require('path');

// Where captured clips land — temporary, just for confirming the pipeline in Phase 1.
const CAPTURE_DIR = path.join(__dirname, '../../captures');
if (!fs.existsSync(CAPTURE_DIR)) fs.mkdirSync(CAPTURE_DIR, { recursive: true });

function startListeningToUser(connection, userId, guildId) {
  const receiver = connection.receiver;

  // Subscribe to this user's audio. Discord ends the stream after ~1s of silence
  // (EndBehaviorType.AfterSilence) — that's our natural "they stopped talking" cue.
  const opusStream = receiver.subscribe(userId, {
    end: {
      behavior: EndBehaviorType.AfterSilence,
      duration: 1000,
    },
  });

  // Discord sends 48kHz stereo Opus — decode it to raw PCM.
  const decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });

  const filename = `${userId}-${Date.now()}.pcm`;
  const filepath = path.join(CAPTURE_DIR, filename);
  const outStream = fs.createWriteStream(filepath);

  opusStream.pipe(decoder).pipe(outStream);

  outStream.on('finish', () => {
    console.log(`[vclisten] captured clip: ${filepath}`);
    // Phase 2 will pick this file up and run it through Whisper.
  });

  opusStream.on('error', (err) => console.error('[vclisten] opus stream error:', err.message));
  decoder.on('error', (err) => console.error('[vclisten] decoder error:', err.message));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vclisten')
    .setDescription('Phase 1 test: axis joins VC and captures audio clips when you talk'),
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
        selfDeaf: false, // must hear audio, so can't self-deafen
      });
    }

    // Listen for the person who ran the command specifically (Phase 1 scope).
    const userId = interaction.user.id;
    connection.receiver.speaking.on('start', (speakingUserId) => {
      if (speakingUserId !== userId) return; // only capture the command user for now
      startListeningToUser(connection, speakingUserId, guildId);
    });

    await interaction.editReply(
      `listening now — say something in VC, then check the \`captures/\` folder for a .pcm file.`
    );
  },
};
