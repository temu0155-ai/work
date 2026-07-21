const { SlashCommandBuilder } = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  VoiceConnectionStatus,
  AudioPlayerStatus,
} = require('@discordjs/voice');
const { generateResponse } = require('../../utils/persona');
const { textToSpeechStream } = require('../../utils/tts');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vcai')
    .setDescription('Talk to axis')
    .addStringOption(option => option.setName('message').setDescription('Message').setRequired(true)),
  async execute(interaction) {
    await interaction.deferReply();
    const prompt = interaction.options.getString('message');
    const voiceChannel = interaction.member?.voice?.channel;

    try {
      const reply = await generateResponse(interaction.user.id, prompt, interaction.member.displayName);
      await interaction.editReply(`🗣️ **axis:** ${reply}`);

      if (!voiceChannel) return; // text-only if user isn't in VC

      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: true,
      });

      await entersState(connection, VoiceConnectionStatus.Ready, 10_000);

      const audioStream = await textToSpeechStream(reply);
      const resource = createAudioResource(audioStream);
      const player = createAudioPlayer();

      connection.subscribe(player);
      player.play(resource);

      await entersState(player, AudioPlayerStatus.Idle, 30_000).catch(() => {});
      connection.destroy(); // leave after speaking; drop this line to stay connected
    } catch (err) {
      console.error(err);
      if (!interaction.replied) await interaction.editReply('axis is thinking too hard, try again.');
    }
  },
};
