/**
 * AI Content Detector — uses the free Hugging Face Inference API.
 * Primary model : openai-community/roberta-base-openai-detector
 * Fallback model: Hello-SimpleAI/chatgpt-detector-roberta
 * Requires HUGGINGFACE_TOKEN env var (free HF account token).
 *
 * Only used internally by staff — never exposed to applicants.
 */

const HF_BASE = 'https://api-inference.huggingface.co/models';
const MODELS = [
  `${HF_BASE}/openai-community/roberta-base-openai-detector`,
  `${HF_BASE}/Hello-SimpleAI/chatgpt-detector-roberta`,
];
const MIN_CHARS = 80;
const TIMEOUT_MS = 25_000;

async function callHF(url, token, inputs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'discord-staff-portal/1.0',
      },
      body: JSON.stringify({ inputs, options: { wait_for_model: true } }),
    });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Detect AI content in a block of text.
 * @param {string} text
 * @returns {{ aiScore: number, humanScore: number, label: string, skipped: boolean, error: string|null }}
 */
export async function detectAI(text) {
  const token = process.env.HUGGINGFACE_TOKEN;
  if (!token) {
    return { aiScore: 0, humanScore: 0, label: 'Unknown', skipped: true, error: 'HUGGINGFACE_TOKEN not set' };
  }

  const trimmed = text.trim();
  if (trimmed.length < MIN_CHARS) {
    return { aiScore: 0, humanScore: 0, label: 'Unknown', skipped: true, error: 'Not enough text to analyse' };
  }

  const input = trimmed.slice(0, 512);
  let lastError = 'Unknown error';

  for (const modelUrl of MODELS) {
    try {
      const res = await callHF(modelUrl, token, input);

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        lastError = `HF API ${res.status}: ${body.slice(0, 120)}`;
        continue;
      }

      const data = await res.json();

      // Both models return [[{label, score}, ...]] or [{label, score}, ...]
      const results = Array.isArray(data[0]) ? data[0] : data;
      if (!Array.isArray(results)) { lastError = 'Unexpected response shape'; continue; }

      // openai detector uses "Real"/"Fake"; chatgpt detector uses "Human"/"ChatGPT"
      const aiEntry    = results.find(r => r.label === 'ChatGPT' || r.label === 'Fake'  || r.label?.toLowerCase().includes('ai'));
      const humanEntry = results.find(r => r.label === 'Human'   || r.label === 'Real'  || r.label?.toLowerCase().includes('human'));

      const aiScore    = aiEntry    ? Math.round(aiEntry.score    * 100) : 0;
      const humanScore = humanEntry ? Math.round(humanEntry.score * 100) : 0;

      let label;
      if (aiScore >= 75)      label = 'Likely AI';
      else if (aiScore >= 45) label = 'Uncertain';
      else                    label = 'Likely Human';

      return { aiScore, humanScore, label, skipped: false, error: null };
    } catch (err) {
      lastError = err.name === 'AbortError' ? 'Request timed out (25 s)' : err.message;
    }
  }

  return { aiScore: 0, humanScore: 0, label: 'Unknown', skipped: true, error: lastError };
}

/**
 * Build a progress-bar string, e.g. "████████░░ 80%"
 */
export function progressBar(pct, width = 10) {
  const filled = Math.round((pct / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled) + ` ${pct}%`;
}
