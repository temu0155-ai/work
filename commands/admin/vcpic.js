const { SlashCommandBuilder } = require('discord.js');
const HORDE_BASE = 'https://stablehorde.net/api/v2';
const HORDE_API_KEY = process.env.AI_HORDE_API_KEY || process.env.HORDE_API_KEY || '0000000000';
// Comma-separated fallback list of models with decent worker counts, instead of leaving fully unset
const IMAGE_MODEL = process.env.HORDE_IMAGE_MODEL || 'stable_diffusion,Deliberate,Realistic Vision,Dreamshaper';
const CLIENT_AGENT = 'kilo-discord-mikasa:1.0:anonymous';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function generateImage(prompt) {
  const headers = {
    'Content-Type': 'application/json',
    'apikey': HORDE_API_KEY,
    'Client-Agent': CLIENT_AGENT
  };
  const payload = {
    prompt,
    params: { width: 512, height: 512, steps: 20, sampler_name: 'k_euler', cfg_scale: 7 },
    models: IMAGE_MODEL.split(',').map(m => m.trim()).filter(Boolean),
    nsfw: true,
  };
  const submitRes = await fetch(`${HORDE_BASE}/generate/async`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });
  if (!submitRes.ok) throw new Error(`Horde image submit failed (${submitRes.status})`);
  const submit = await submitRes.json();
  const id = submit.id;
  if (!id) throw new Error('Horde did not return a request id');
  console.log(`[vcpic] job id: ${id} — check https://aihorde.net/`);

  const deadline = Date.now() + 240000;
  while (Date.now() < deadline) {
    await sleep(4000);
    let statusRes;
    try {
      statusRes = await fetch(`${HORDE_BASE}/generate/status/${id}`, {
        headers: { apikey: HORDE_API_KEY },
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      continue;
    }
    if (!statusRes.ok) continue;
    const status = await statusRes.json();
    if (status.faulted) throw new Error('Horde image request faulted');
    if (status.done && status.generations && status.generations.length) {
      return status.generations[0].img;
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
