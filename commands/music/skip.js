const { SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("skip")
        .setDescription("Ueberspringt den aktuellen Song."),
    async execute(interaction) {
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return await interaction.reply({ content: "❌ Du musst im selben Voice-Channel sein!", ephemeral: true });
        }

        const queue = interaction.client.distube.getQueue(interaction.guildId);
        if (!queue) {
            return await interaction.reply({ content: "❌ Es läuft gerade keine Musik!", ephemeral: true });
        }

        try {
            await queue.skip();
            await interaction.reply("⏭️ Song übersprungen!");
        } catch (error) {
            await interaction.reply({ content: "❌ Keine weiteren Songs in der Warteschlange zum Überspringen.", ephemeral: true });
        }
    }
};
