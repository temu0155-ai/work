const { SlashCommandBuilder } = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  VoiceConnectionStatus,
  AudioPlayerStatus,
} = require('@discordjs/voice');
const { generateResponse } = require('../../utils/persona');
const { textToSpeechStream } = require('../../utils/tts');

// One shared audio player per guild, reused across calls so she doesn't rejoin every time.
const players = new Map(); // guildId -> AudioPlayer

function getOrCreatePlayer(guildId) {
  let player = players.get(guildId);
  if (!player) {
    player = createAudioPlayer();
    players.set(guildId, player);
  }
  return player;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vcai')
    .setDescription('Talk to axis')
    .addStringOption(option => option.setName('message').setDescription('Message').setRequired(true)),
  async execute(interaction) {
    await interaction.deferReply();
    const prompt = interaction.options.getString('message');
    const voiceChannel = interaction.member?.voice?.channel;
    const guildId = interaction.guild?.id;
    let textReplySent = false;

    try {
      const reply = await generateResponse(interaction.user.id, prompt, interaction.member.displayName);
      await interaction.editReply(`^.^ **Mikasa:** ${reply}`);
      textReplySent = true;

      if (!voiceChannel || !guildId) return; // text-only if user isn't in VC

      // Reuse an existing connection for this guild if she's already in a VC.
      let connection = getVoiceConnection(guildId);

      // If she's not connected, or she's connected to a DIFFERENT channel than
      // the user is currently in, (re)join the user's channel.
      if (!connection || connection.joinConfig.channelId !== voiceChannel.id) {
        connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId,
          adapterCreator: voiceChannel.guild.voiceAdapterCreator,
          selfDeaf: true,
        });
        await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
      }

      const player = getOrCreatePlayer(guildId);
      connection.subscribe(player);

      const audioStream = await textToSpeechStream(reply);
      const resource = createAudioResource(audioStream);
      player.play(resource);

      // Wait for playback to finish, but do NOT destroy the connection —
      // she stays in the channel for the next /vcai call.
      await entersState(player, AudioPlayerStatus.Idle, 30_000).catch(() => {});
    } catch (err) {
      console.error(err);
      if (!textReplySent) {
        await interaction.editReply('axis is thinking too hard, try again.');
      }
    }
  },
};
