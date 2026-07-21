const { SlashCommandBuilder } = require('discord.js');
const {
  joinVoiceChannel, getVoiceConnection, createAudioPlayer, createAudioResource,
  StreamType, VoiceConnectionStatus, entersState,
} = require('@discordjs/voice');
const { generateResponse } = require('../../utils/persona');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const AXIS_VOICE = process.env.TTS_VOICE || 'en-US-AriaNeural';
const guildPlayers = new Map();

// Generate speech audio file using edge-tts CLI (way more reliable than JS wrappers)
function speak(text, voice) {
  return new Promise((resolve, reject) => {
    const outFile = path.join(os.tmpdir(), `axis-${Date.now()}.mp3`);
    const proc = spawn('edge-tts', ['--voice', voice, '--text', text, '--write-media', outFile]);
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`edge-tts exit ${code}: ${stderr.slice(0, 300)}`));
      } else if (!fs.existsSync(outFile)) {
        reject(new Error('edge-tts produced no output file'));
      } else {
        resolve(outFile);
      }
    });
    proc.on('error', (err) => reject(new Error(`edge-tts not found: ${err.message}`)));
  });
}

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
    let aiTextReply = '';
    let audioFile = '';

    try {
      // 1. axis thinks
      aiTextReply = await generateResponse(interaction.user.id, prompt, interaction.member.displayName);
      await interaction.editReply(`🗣️ **axis:** "${aiTextReply}"`);

      // 2. generate speech audio file
      audioFile = await speak(aiTextReply, AXIS_VOICE);

      // 3. join VC
      let connection = getVoiceConnection(interaction.guildId);
      if (!connection) {
        connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: interaction.guildId,
          adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });
      }
      await entersState(connection, VoiceConnectionStatus.Ready, 15000);

      // 4. play it
      let player = guildPlayers.get(interaction.guildId);
      if (!player) {
        player = createAudioPlayer();
        connection.subscribe(player);
        guildPlayers.set(interaction.guildId, player);
      }

      const resource = createAudioResource(audioFile, { inputType: StreamType.Arbitrary });
      player.play(resource);

      // 5. clean up temp file after it finishes playing
      player.once('stateChange', (_, newState) => {
        if (newState.status === 'idle' && audioFile) {
          try { fs.unlinkSync(audioFile); } catch {}
        }
      });

    } catch (error) {
      const detail = error?.message || String(error);
      console.error('[vcai] error:', detail);
      const text = aiTextReply ? `🗣️ **axis:** "${aiTextReply}"\n\n` : '';
      await interaction.editReply(`${text}⚠️ voice hiccup: ${detail}`).catch(() => {});
      if (audioFile) try { fs.unlinkSync(audioFile); } catch {}
    }
  },
};
