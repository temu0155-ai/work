// utils/aihorde.js
//
// Thin client for the AI Horde image generation API (https://aihorde.net).
// AI Horde is queue-based: you submit a job, then poll until it's done.
// Using the anonymous key "0000000000" works but is heavily rate-limited
// and low priority — get a free key at https://aihorde.net/register and
// set AIHORDE_API_KEY in your env for much faster results.

const BASE_URL = 'https://aihorde.net/api/v2';
const API_KEY = process.env.AIHORDE_API_KEY || '0000000000';

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 60; // ~5 minutes max wait

async function submitImageRequest({
  prompt,
  negativePrompt = '',
  width = 512,
  height = 512,
  steps = 30,
  sampler = 'k_euler_a',
  cfgScale = 7,
  model = undefined, // let Horde pick a model if not specified
  nsfw = false,
}) {
  const fullPrompt = negativePrompt ? `${prompt} ### ${negativePrompt}` : prompt;

  const body = {
    prompt: fullPrompt,
    params: {
      width,
      height,
      steps,
      sampler_name: sampler,
      cfg_scale: cfgScale,
      n: 1,
    },
    nsfw,
    models: model ? [model] : undefined,
  };

  const res = await fetch(`${BASE_URL}/generate/async`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: API_KEY,
      'Client-Agent': 'discord-bot:1.0:unknown',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AI Horde rejected the request (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.id; // job id
}

async function checkStatus(jobId) {
  const res = await fetch(`${BASE_URL}/generate/check/${jobId}`);
  if (!res.ok) throw new Error(`Status check failed (${res.status})`);
  return res.json(); // { finished, waiting, processing, done, wait_time, queue_position, ... }
}

async function fetchResult(jobId) {
  const res = await fetch(`${BASE_URL}/generate/status/${jobId}`);
  if (!res.ok) throw new Error(`Result fetch failed (${res.status})`);
  return res.json(); // { generations: [{ img, seed, model, worker_name }], done, faulted }
}

/**
 * Submits a prompt and waits (polling) until the image is ready.
 * onProgress(status) is called after each poll so callers can update a
 * Discord message with queue position / wait time.
 */
async function generateImage(params, onProgress) {
  const jobId = await submitImageRequest(params);

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const status = await checkStatus(jobId);
    if (onProgress) onProgress(status);

    if (status.faulted) {
      throw new Error('Generation faulted on AI Horde\'s end — try again.');
    }

    if (status.done) {
      const result = await fetchResult(jobId);
      if (!result.generations || result.generations.length === 0) {
        throw new Error('AI Horde returned no images.');
      }
      return result.generations.map((g) => ({
        url: g.img,
        seed: g.seed,
        model: g.model,
        worker: g.worker_name,
      }));
    }
  }

  throw new Error('Timed out waiting for AI Horde to finish generating.');
}

module.exports = { generateImage, submitImageRequest, checkStatus, fetchResult };
