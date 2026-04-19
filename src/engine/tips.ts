/**
 * Prompt-craft playbook — specific, copy-paste rewrites and habits that
 * reduce the token count a session burns.
 *
 * Philosophy: same model, same ambition, fewer wasted tokens.
 * We never tell the developer to downgrade to a lighter model or code
 * less. Every lever is about PROMPT precision, RESPONSE shape, or
 * CACHE continuity — the three efficiency pillars that don't trade
 * capability for carbon.
 *
 * Based on Mamun et al. (2026) showing token count as the dominant
 * controllable energy driver (R²≈0.44).
 */

export type TipCategory = "prompt" | "response" | "cache";

export interface Tip {
  name: string;
  category: TipCategory;
  before: string;
  after: string;
  why: string;
}

export const TIPS: Tip[] = [
  // ── PROMPT: how you write what you send ────────────────
  {
    name: "Name, don't describe",
    category: "prompt",
    before: `"the function that handles auth and validates the token"`,
    after: `"validateAuthToken() in src/auth.ts"`,
    why: "Symbol refs stay tiny. Vague descriptions force the agent to grep, read, and guess — each step pays full prefill on the same model.",
  },
  {
    name: "Drop role preambles",
    category: "prompt",
    before: `"You are an expert TypeScript engineer. Carefully..."`,
    after: `direct task, no preamble`,
    why: "50–200 tokens × every prompt. Agentic loops don't gain measurable quality from role preambles past turn 1.",
  },
  {
    name: "Reference, don't paste",
    category: "prompt",
    before: `paste 200 lines of the same file each turn`,
    after: `"src/auth.ts:40-60" · stable files → CLAUDE.md`,
    why: "Files in CLAUDE.md ride the cache every turn at 10% energy. Pasted content pays full prefill on each turn.",
  },

  // ── RESPONSE: how you constrain what comes back ────────
  {
    name: "Show, don't regenerate",
    category: "response",
    before: `"regenerate this, make it more robust"`,
    after: `"add null check on line 42, keep everything else"`,
    why: "Surgical edits reuse cached context. Re-rolls recompute the whole function from scratch on the same model.",
  },
  {
    name: "Constrain the answer",
    category: "response",
    before: `"explain what's wrong with this code"`,
    after: `"one-line diff, no prose, no preamble"`,
    why: "Output tokens always cost full energy; prose has no cache discount. Shape the answer to what you actually need.",
  },

  // ── CACHE: how you preserve context warmth ─────────────
  {
    name: "Batch adjacent asks",
    category: "cache",
    before: `3 separate "also, can you..." follow-ups`,
    after: `numbered list · one turn · "1) ... 2) ... 3) ..."`,
    why: "Each new turn pays prefill again — tools + system + history re-processed. Consolidating keeps the cache working.",
  },
  {
    name: "Keep CLAUDE.md stable",
    category: "cache",
    before: `edit CLAUDE.md mid-session to add instructions`,
    after: `settle CLAUDE.md before coding · treat as cache-resident`,
    why: "CLAUDE.md content is prefixed to every turn. Changes invalidate the cache; stability keeps every turn on the 10%-energy cache path.",
  },
  {
    name: "Stay in one session",
    category: "cache",
    before: `/clear or restart between related tasks`,
    after: `keep related work in one chat · 5-min cache TTL`,
    why: "Each new session pays full prefill on system prompt + tools + CLAUDE.md. Cache window reopens when you stay.",
  },
];

export const CATEGORY_DESCRIPTIONS: Record<TipCategory, string> = {
  prompt:   "How you write the input — direct lever",
  response: "How you constrain the output — direct lever",
  cache:    "How you preserve context warmth — minor habit, indirect effect",
};

export function findTipsByCategory(category: string): Tip[] {
  return TIPS.filter((t) => t.category === category);
}
