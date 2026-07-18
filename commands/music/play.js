const { SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("play")
        .setDescription("Spielt ein Lied oder eine Playlist im Voice-Channel ab.")
        .addStringOption(option =>
            option.setName("query")
                .setDescription("Songname oder URL (YouTube, Spotify etc.)")
                .setRequired(true)
        ),
    async execute(interaction) {
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return await interaction.reply({ content: "❌ Du musst in einem Voice-Channel sein, um Musik zu spielen!", ephemeral: true });
        }

        const query = interaction.options.getString("query");
        await interaction.deferReply();

        try {
            await interaction.client.distube.play(voiceChannel, query, {
                textChannel: interaction.channel,
                member: interaction.member,
                metadata: { interaction }
            });
            await interaction.editReply(`🔍 Suche nach: **${query}**...`);
        } catch (error) {
            console.error(error);
            await interaction.editReply("❌ Es gab einen Fehler beim Abspielen des Songs.");
        }
    }
};
