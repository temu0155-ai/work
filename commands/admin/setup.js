const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { runAiSetup } = require('../../ai-tools');

const MAX_REPLY = 2000;
const clamp = (s) => {
  const t = String(s ?? '');
  return t.length > MAX_REPLY ? t.slice(0, MAX_REPLY - 1) + '…' : t;
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Use AI to set up your server')
    .addStringOption((o) =>
      o.setName('prompt').setDescription('Describe what you want').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const prompt = interaction.options.getString('prompt');
    const tag = interaction.user.tag;
    console.log(`[SETUP] prompt from ${tag}: "${prompt}"`);

    try {
      await interaction.deferReply();
    } catch (e) {
      console.error('[SETUP] deferReply failed (interaction expired?):', e.message);
      return;
    }

    // Memory keyed per-admin so two admins in the same channel don't share /
    // overwrite each other's setup context. (Want the old "shared per channel"
    // behaviour? Use interaction.channelId here instead.)
    const sessionId = `${interaction.guildId}:${interaction.user.id}`;

    // ---- live progress, funnelled through one chain so the final edit always wins ----
    const startTs = Date.now();
    let lastProgressText = '';
    let editQueue = Promise.resolve();

    const queueEdit = (text) => {
      const safe = clamp(text);
      if (safe === lastProgressText) return;       // no-op duplicate edits
      lastProgressText = safe;
      editQueue = editQueue.then(() =>
        interaction.editReply(safe).catch((err) => {
          // user dismissed the response / interaction gone — not fatal
          if (err?.code !== 10062 && err?.code !== 10008) {
            console.warn('[SETUP] progress edit failed:', err.message);
          }
        })
      );
    };

    // Passed to runAiSetup. If the installed ai-tools ignores it, this never
    // runs and the user just sees the normal "thinking…" spinner.
    const onProgress = (p) => {
      const secs = Math.round((Date.now() - startTs) / 1000);
      let line = `⏳ Setting up… (round ${p.round || '?'}/${p.maxRounds || '?'}, ${secs}s)`;
      if (p.phase === 'thinking') line += '\n🧠 thinking…';
      else if (p.phase === 'tool') line += `\n🔧 ${p.toolName} → ${clamp(p.message || '').slice(0, 120)}`;
      queueEdit(line);
    };

    try {
      console.log(`[SETUP] processing via AI Horde…`);
      const result = await runAiSetup(
        prompt,
        interaction.guild,
        sessionId,
        interaction.member,
        onProgress            // 5th arg — ignored by old ai-tools, used by patched one
      );
      const text = clamp(result || 'No actions were taken.');
      console.log(`[SETUP] done: ${text.slice(0, 100)}${text.length > 100 ? '…' : ''}`);

      queueEdit(text);        // final answer joins the same chain → always wins
      await editQueue;        // wait until it actually lands
    } catch (error) {
      console.error('[SETUP ERROR]', error.message);
      console.error(error.stack);
      queueEdit(`⚠️ Setup failed: ${error.message}`);
      await editQueue;
    }
  },
};
