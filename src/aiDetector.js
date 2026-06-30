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

const HF_BASE   = 'https://api-inference.huggingface.co/models';
const HF_MODELS = [
  `${HF_BASE}/openai-community/roberta-base-openai-detector`,
  `${HF_BASE}/Hello-SimpleAI/chatgpt-detector-roberta`,
];
const MIN_CHARS  = 80;
const TIMEOUT_MS = 30_000;

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
      body: JSON.stringify({ inputs, options: { wait_for_model: true, use_cache: true } }),
    });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ─── Local heuristic fallback ────────────────────────────────────────────────

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
  const words     = text.trim().split(/\s+/);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

  const phraseHits  = AI_PHRASES.filter(re => re.test(text)).length;
  const phraseScore = Math.min(phraseHits * 5, 40);

  const contractions = (text.match(/\b(don't|can't|won't|I'm|I've|I'll|I'd|it's|that's|there's|they're|we're|you're|he's|she's|isn't|wasn't|weren't|hasn't|haven't|didn't|wouldn't|couldn't|shouldn't)\b/gi) || []).length;
  const contractionRatio = contractions / Math.max(words.length, 1);
  const contractionScore = contractionRatio < 0.01 ? 20 : contractionRatio < 0.03 ? 10 : 0;

  let uniformScore = 0;
  if (sentences.length >= 3) {
    const lens     = sentences.map(s => s.trim().split(/\s+/).length);
    const avg      = lens.reduce((a, b) => a + b, 0) / lens.length;
    const variance = lens.reduce((a, b) => a + (b - avg) ** 2, 0) / lens.length;
    if (variance < 5)  uniformScore = 20;
    else if (variance < 15) uniformScore = 10;
  }

  const avgWords  = words.length / Math.max(sentences.length, 1);
  const lengthScore = avgWords > 30 ? 10 : avgWords > 22 ? 5 : 0;

  const unique    = new Set(words.map(w => w.toLowerCase().replace(/[^a-z]/g, ''))).size;
  const diversity = unique / Math.max(words.length, 1);
  const diversityScore = diversity > 0.75 ? 10 : diversity > 0.65 ? 5 : 0;

  return Math.min(phraseScore + contractionScore + uniformScore + lengthScore + diversityScore, 100);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function detectAI(text) {
  const token   = process.env.HUGGINGFACE_TOKEN;
  const trimmed = text.trim();

  if (trimmed.length < MIN_CHARS) {
    const aiScore = heuristicScore(trimmed);
    return {
      aiScore, humanScore: 100 - aiScore,
      label:   aiScore >= 75 ? 'Likely AI' : aiScore >= 45 ? 'Uncertain' : 'Likely Human',
      skipped: false,
      source:  'Heuristic (text too short for ML)',
      error:   null,
    };
  }

  const input = trimmed.slice(0, 512);

  if (!token) {
    console.warn('[AI-detect] HUGGINGFACE_TOKEN not set — falling back to heuristic');
    const aiScore = heuristicScore(input);
    return {
      aiScore, humanScore: 100 - aiScore,
      label:   aiScore >= 75 ? 'Likely AI' : aiScore >= 45 ? 'Uncertain' : 'Likely Human',
      skipped: false,
      source:  'Heuristic (HUGGINGFACE_TOKEN not set)',
      error:   'HUGGINGFACE_TOKEN not set',
    };
  }

  // ── Try HuggingFace models ────────────────────────────────────────────────
  for (const modelUrl of HF_MODELS) {
    const modelName = modelUrl.split('/').slice(-2).join('/');
    try {
      const res = await callHF(modelUrl, token, input);

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.warn(`[AI-detect] ${modelName} returned ${res.status}: ${body.slice(0, 200)}`);
        continue;
      }

      const data    = await res.json();
      const results = Array.isArray(data[0]) ? data[0] : data;
      if (!Array.isArray(results)) {
        console.warn(`[AI-detect] ${modelName} unexpected response shape:`, JSON.stringify(data).slice(0, 200));
        continue;
      }

      const aiEntry    = results.find(r => r.label === 'ChatGPT' || r.label === 'Fake'  || r.label?.toLowerCase().includes('ai'));
      const humanEntry = results.find(r => r.label === 'Human'   || r.label === 'Real'  || r.label?.toLowerCase().includes('human'));

      if (!aiEntry && !humanEntry) {
        console.warn(`[AI-detect] ${modelName} returned unrecognised labels:`, results.map(r => r.label).join(', '));
        continue;
      }

      const aiScore    = aiEntry    ? Math.round(aiEntry.score    * 100) : 0;
      const humanScore = humanEntry ? Math.round(humanEntry.score * 100) : 0;

      return {
        aiScore, humanScore,
        label:   aiScore >= 75 ? 'Likely AI' : aiScore >= 45 ? 'Uncertain' : 'Likely Human',
        skipped: false,
        source:  `ML · ${modelName}`,
        error:   null,
      };
    } catch (err) {
      console.warn(`[AI-detect] ${modelName} threw: ${err.message}`);
    }
  }

  // ── HuggingFace failed → local heuristic fallback ────────────────────────
  console.warn('[AI-detect] All HuggingFace models failed — using heuristic');
  const aiScore = heuristicScore(input);
  return {
    aiScore, humanScore: 100 - aiScore,
    label:   aiScore >= 75 ? 'Likely AI' : aiScore >= 45 ? 'Uncertain' : 'Likely Human',
    skipped: false,
    source:  'Heuristic (HuggingFace API unavailable)',
    error:   null,
  };
}

export function progressBar(pct, width = 10) {
  const filled = Math.round((pct / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled) + ` ${pct}%`;
}
