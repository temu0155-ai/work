const { SlashCommandBuilder } = require('discord.js');

const HORDE_BASE = 'https://stablehorde.net/api/v2';
const HORDE_API_KEY = process.env.AI_HORDE_API_KEY || process.env.HORDE_API_KEY || '0000000000';

// Fallback to active NSFW-capable models if env variable isn't specified
const DEFAULT_MODELS = [
  'Pony Diffusion V6 XL',
  'CyberRealistic',
  'Anything Diffusion',
  'Deliberate'
];

const IMAGE_MODEL = process.env.HORDE_IMAGE_MODEL 
  ? process.env.HORDE_IMAGE_MODEL.split(',').map(m => m.trim()).filter(Boolean)
  : DEFAULT_MODELS;

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
    params: {
      width: 512,
      height: 512,
      steps: 25,
      sampler_name: 'k_euler',
      cfg_scale: 7,
      censor_nsfw: false // Prevents workers from applying black-box post-censorship
    },
    models: IMAGE_MODEL,
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

  console.log(`[vcpic] job id: ${id} — tracking on AI Horde cluster`);

  const deadline = Date.now() + 240000; // 4-minute timeout limit

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
    // 1. Guard check: Ensure channel is marked as NSFW in Discord
    if (interaction.channel && !interaction.channel.nsfw) {
      return interaction.reply({
        content: '❌ You can only generate NSFW content in channel(s) marked as **NSFW** in Discord channel settings.',
        ephemeral: true
      });
    }

    await interaction.deferReply();
    const prompt = interaction.options.getString('prompt');

    try {
      const imageUrl = await generateImage(prompt);
      await interaction.editReply({ content: `🎨 **"${prompt}"**`, files: [imageUrl] });
    } catch (err) {
      console.error('[vcpic] error:', err.message);
      await interaction.editReply('horde is being slow or queue is busy right now, try again in a bit.');
    }
  },
};
