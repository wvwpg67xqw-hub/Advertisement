/**
 * AI Content Detector
 *
 * Strategy (in order):
 *  1. HuggingFace openai-community/roberta-base-openai-detector  (most accurate)
 *  2. HuggingFace Hello-SimpleAI/chatgpt-detector-roberta        (fallback API)
 *  3. Local heuristic analyser                                    (always works, no network)
 *
 * Always returns a result — never skips.
 * Requires HUGGINGFACE_TOKEN for steps 1–2 (optional; step 3 never needs it).
 */

const HF_BASE    = 'https://api-inference.huggingface.co/models';
const HF_MODELS  = [
  `${HF_BASE}/openai-community/roberta-base-openai-detector`,
  `${HF_BASE}/Hello-SimpleAI/chatgpt-detector-roberta`,
];
const MIN_CHARS  = 80;
const TIMEOUT_MS = 25_000;

// ─── HuggingFace call ────────────────────────────────────────────────────────

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

// ─── Local heuristic fallback ────────────────────────────────────────────────
// Scores a piece of text for AI-likeness using writing-pattern signals.
// Returns 0–100 (higher = more likely AI).

const AI_PHRASES = [
  /\bin conclusion\b/i,
  /\bfurthermore\b/i,
  /\bmoreover\b/i,
  /\badditionally\b/i,
  /\bin summary\b/i,
  /\bto summarize\b/i,
  /\bit is (important|worth noting|essential)\b/i,
  /\bI (am passionate|am excited|am eager|am committed|am dedicated) (about|to)\b/i,
  /\bI would like to\b/i,
  /\bI believe that\b/i,
  /\bone must\b/i,
  /\beffective(ly)?\b/i,
  /\bensure\b/i,
  /\bultimately\b/i,
  /\boverall\b/i,
  /\bthis (role|position|opportunity)\b/i,
  /\bI am (a|an) (dedicated|hardworking|motivated|passionate)\b/i,
  /\bcollaborate\b/i,
  /\bfoster\b/i,
  /\bstrive\b/i,
  /\bleverage\b/i,
  /\bsynergy\b/i,
  /\bproactive(ly)?\b/i,
];

function heuristicScore(text) {
  const words = text.trim().split(/\s+/);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

  // 1. AI-phrase hits (up to 40 pts)
  const phraseHits = AI_PHRASES.filter(re => re.test(text)).length;
  const phraseScore = Math.min(phraseHits * 5, 40);

  // 2. Low contraction ratio (AI rarely uses contractions) — up to 20 pts
  const contractions = (text.match(/\b(don't|can't|won't|I'm|I've|I'll|I'd|it's|that's|there's|they're|we're|you're|he's|she's|isn't|wasn't|weren't|hasn't|haven't|didn't|wouldn't|couldn't|shouldn't)\b/gi) || []).length;
  const contractionRatio = contractions / Math.max(words.length, 1);
  const contractionScore = contractionRatio < 0.01 ? 20 : contractionRatio < 0.03 ? 10 : 0;

  // 3. Very uniform sentence length (AI tends to write equally-long sentences) — up to 20 pts
  let uniformScore = 0;
  if (sentences.length >= 3) {
    const lens = sentences.map(s => s.trim().split(/\s+/).length);
    const avg  = lens.reduce((a, b) => a + b, 0) / lens.length;
    const variance = lens.reduce((a, b) => a + (b - avg) ** 2, 0) / lens.length;
    if (variance < 5)  uniformScore = 20;
    else if (variance < 15) uniformScore = 10;
  }

  // 4. Long average sentence (AI writes longer sentences) — up to 10 pts
  const avgWords = words.length / Math.max(sentences.length, 1);
  const lengthScore = avgWords > 30 ? 10 : avgWords > 22 ? 5 : 0;

  // 5. Very high lexical diversity (AI uses many varied words) — up to 10 pts
  const unique = new Set(words.map(w => w.toLowerCase().replace(/[^a-z]/g, ''))).size;
  const diversity = unique / Math.max(words.length, 1);
  const diversityScore = diversity > 0.75 ? 10 : diversity > 0.65 ? 5 : 0;

  const total = Math.min(phraseScore + contractionScore + uniformScore + lengthScore + diversityScore, 100);
  return total;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Detect AI content in a block of text.
 * ALWAYS returns a result — never returns { skipped: true }.
 *
 * @param {string} text
 * @returns {{ aiScore: number, humanScore: number, label: string, skipped: boolean, source: string, error: string|null }}
 */
export async function detectAI(text) {
  const token   = process.env.HUGGINGFACE_TOKEN;
  const trimmed = text.trim();

  if (trimmed.length < MIN_CHARS) {
    // Too short for ML — use heuristic directly
    const aiScore    = heuristicScore(trimmed);
    const humanScore = 100 - aiScore;
    return {
      aiScore, humanScore,
      label:   aiScore >= 75 ? 'Likely AI' : aiScore >= 45 ? 'Uncertain' : 'Likely Human',
      skipped: false,
      source:  'Heuristic (text too short for ML)',
      error:   null,
    };
  }

  const input = trimmed.slice(0, 512);

  // ── Try HuggingFace models ────────────────────────────────────────────────
  if (token) {
    for (const modelUrl of HF_MODELS) {
      try {
        const res = await callHF(modelUrl, token, input);
        if (!res.ok) continue;

        const data    = await res.json();
        const results = Array.isArray(data[0]) ? data[0] : data;
        if (!Array.isArray(results)) continue;

        const aiEntry    = results.find(r => r.label === 'ChatGPT' || r.label === 'Fake'  || r.label?.toLowerCase().includes('ai'));
        const humanEntry = results.find(r => r.label === 'Human'   || r.label === 'Real'  || r.label?.toLowerCase().includes('human'));

        const aiScore    = aiEntry    ? Math.round(aiEntry.score    * 100) : 0;
        const humanScore = humanEntry ? Math.round(humanEntry.score * 100) : 0;
        const modelName  = modelUrl.split('/').slice(-2).join('/');

        return {
          aiScore, humanScore,
          label:   aiScore >= 75 ? 'Likely AI' : aiScore >= 45 ? 'Uncertain' : 'Likely Human',
          skipped: false,
          source:  `ML · ${modelName}`,
          error:   null,
        };
      } catch {
        // try next model
      }
    }
  }

  // ── Local heuristic — always works ───────────────────────────────────────
  const aiScore    = heuristicScore(input);
  const humanScore = 100 - aiScore;
  return {
    aiScore, humanScore,
    label:   aiScore >= 75 ? 'Likely AI' : aiScore >= 45 ? 'Uncertain' : 'Likely Human',
    skipped: false,
    source:  token ? 'Heuristic (API unavailable)' : 'Heuristic (no token)',
    error:   null,
  };
}

/**
 * Build a progress-bar string, e.g. "████████░░ 80%"
 */
export function progressBar(pct, width = 10) {
  const filled = Math.round((pct / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled) + ` ${pct}%`;
}
