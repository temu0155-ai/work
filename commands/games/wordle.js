const { SlashCommandBuilder } = require("discord.js");
const { todayDateString, getWordForDate, evaluateGuess, formatGuessBlock } = require("../../utils/wordle");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("wordle")
        .setDescription("Spiele das taegliche Wordle-Spiel!")
        .addStringOption(option => option.setName("guess").setDescription("Dein Tipp (5 Buchstaben)").setRequired(true).setMaxLength(5).setMinLength(5)),
    async execute(interaction) {
        const guess = interaction.options.getString("guess").toUpperCase();
        const dateStr = todayDateString();
        const targetWord = getWordForDate(dateStr);
        if (!/^[A-Z]{5}$/.test(guess)) return await interaction.reply({ content: "Dein Tipp darf nur aus 5 Buchstaben bestehen!", ephemeral: true });
        const evaluation = evaluateGuess(guess, targetWord);
        const resultBlock = formatGuessBlock(evaluation);
        if (guess === targetWord) {
            await interaction.reply({ content: `🎉 **Richtig erraten!** Du hast das heutige Wort gefunden!

${resultBlock}` });
        } else {
            await interaction.reply({ content: `Versuch es weiter! Dein Tipp:

${resultBlock}`, ephemeral: true });
        }
    }
};
