/**
 * AI Content Detector — uses the free Hugging Face Inference API.
 * Model: Hello-SimpleAI/chatgpt-detector-roberta
 * Requires HUGGINGFACE_TOKEN env var (free account token from huggingface.co).
 *
 * Only used internally by staff — never exposed to applicants.
 */

const HF_MODEL = 'https://api-inference.huggingface.co/models/Hello-SimpleAI/chatgpt-detector-roberta';
const MIN_CHARS = 80;

/**
 * Detect AI content in a block of text.
 * @param {string} text — the text to analyse
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

  try {
    const res = await fetch(HF_MODEL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: trimmed.slice(0, 512) }),
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 503) {
        return { aiScore: 0, humanScore: 0, label: 'Unknown', skipped: true, error: 'Model is loading — try again shortly' };
      }
      return { aiScore: 0, humanScore: 0, label: 'Unknown', skipped: true, error: `HF API error ${res.status}: ${body.slice(0, 100)}` };
    }

    const data = await res.json();

    if (!Array.isArray(data) || !Array.isArray(data[0])) {
      return { aiScore: 0, humanScore: 0, label: 'Unknown', skipped: true, error: 'Unexpected API response shape' };
    }

    const results = data[0];
    const ai    = results.find(r => r.label === 'ChatGPT') ?? results.find(r => r.label?.toLowerCase().includes('ai'));
    const human = results.find(r => r.label === 'Human')   ?? results.find(r => r.label?.toLowerCase().includes('human'));

    const aiScore    = ai    ? Math.round(ai.score    * 100) : 0;
    const humanScore = human ? Math.round(human.score * 100) : 0;

    let label;
    if (aiScore >= 75)      label = 'Likely AI';
    else if (aiScore >= 45) label = 'Uncertain';
    else                    label = 'Likely Human';

    return { aiScore, humanScore, label, skipped: false, error: null };
  } catch (err) {
    return { aiScore: 0, humanScore: 0, label: 'Unknown', skipped: true, error: err.message };
  }
}

/**
 * Build a progress-bar string, e.g. "████████░░ 80%"
 */
export function progressBar(pct, width = 10) {
  const filled = Math.round((pct / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled) + ` ${pct}%`;
}
