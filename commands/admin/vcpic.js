const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');

const HORDE_BASE = 'https://stablehorde.net/api/v2';
const HORDE_API_KEY = process.env.HORDE_API_KEY || '0000000000';
const IMAGE_MODEL = process.env.HORDE_IMAGE_MODEL || 'stable_diffusion';
const CLIENT_AGENT = 'kilo-discord-mikasa:1.0:anonymous';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function generateImage(prompt) {
  const headers = { 'Content-Type': 'application/json', apikey: HORDE_API_KEY, 'Client-Agent': CLIENT_AGENT };

  const submitRes = await fetch(`${HORDE_BASE}/generate/async`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt,
      params: { width: 512, height: 512, steps: 25, sampler_name: 'k_euler', cfg_scale: 7 },
      models: [IMAGE_MODEL],
      nsfw: false,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!submitRes.ok) throw new Error(`Horde image submit failed (${submitRes.status})`);
  const submit = await submitRes.json();
  const id = submit.id;
  if (!id) throw new Error('Horde did not return a request id');

  const deadline = Date.now() + 120000; // images take longer than text
  while (Date.now() < deadline) {
    await sleep(3000);
    let statusRes;
    try {
      statusRes = await fetch(`${HORDE_BASE}/generate/status/${id}`, {
        headers: { apikey: HORDE_API_KEY }, signal: AbortSignal.timeout(15000),
      });
    } catch { continue; }
    if (!statusRes.ok) continue;
    const status = await statusRes.json();
    if (status.faulted) throw new Error('Horde image request faulted');
    if (status.done && status.generations && status.generations.length) {
      return status.generations[0].img; // URL to the generated image
    }
  }
  throw new Error('Horde image generation timed out');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vcpic')
    .setDescription('Ask axis/Mikasa to generate an image')
    .addStringOption(option => option.setName('prompt').setDescription('What to generate').setRequired(true)),
  async execute(interaction) {
    await interaction.deferReply();
    const prompt = interaction.options.getString('prompt');
    try {
      const imageUrl = await generateImage(prompt);
      await interaction.editReply({ content: `🎨 **"${prompt}"**`, files: [imageUrl] });
    } catch (err) {
      console.error('[vcpic] error:', err.message);
      await interaction.editReply('horde is being slow with images rn, try again in a bit.');
    }
  },
};
