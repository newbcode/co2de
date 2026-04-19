import { readFileSync, existsSync } from "node:fs";
import type { TokenUsage, AuditFinding } from "../core/types.js";
import { calculateCarbon } from "./carbon-calculator.js";

/** Detect low cache utilization: high cache_creation but low cache_read ratio. */
export function analyzeCacheUtilization(entries: TokenUsage[], region = "global"): AuditFinding | null {
  let totalCacheWrite = 0;
  let totalCacheRead = 0;

  for (const e of entries) {
    totalCacheWrite += e.cache_write_tokens;
    totalCacheRead += e.cache_read_tokens;
  }

  const totalCache = totalCacheWrite + totalCacheRead;
  if (totalCache < 1000) return null;

  const readRatio = totalCacheRead / totalCache;
  if (readRatio > 0.5) return null;

  // Wasted = cache_write tokens that were never read back
  // Savings = if those tokens had been read from cache instead of regenerated
  const wastedTokens = totalCacheWrite * (1 - readRatio);
  const asWasted = calculateCarbon({
    input_tokens: Math.round(wastedTokens),
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    model: entries[0]?.model ?? "unknown",
    provider: "claude",
    timestamp: "",
    session_id: "",
  }, region);
  const savingsGrams = asWasted.co2_grams * 0.3; // ~30% recoverable
  if (savingsGrams < 0.01) return null;

  return {
    severity: readRatio < 0.2 ? "medium" : "low",
    pattern: "Low cache utilization",
    description: `Cache read ratio: ${(readRatio * 100).toFixed(0)}% (${totalCacheRead.toLocaleString()} read / ${totalCacheWrite.toLocaleString()} created)`,
    potential_savings_grams: savingsGrams,
    suggestion: "Structure prompts for better cache hits — keep stable system prompts",
  };
}

/** Detect context bloat: input_tokens growing significantly across a session. */
export function analyzeContextGrowth(entries: TokenUsage[], region = "global"): AuditFinding | null {
  if (entries.length < 3) return null;

  const firstInput = entries[0].input_tokens + entries[0].cache_read_tokens;
  const lastInput =
    entries[entries.length - 1].input_tokens +
    entries[entries.length - 1].cache_read_tokens;

  if (firstInput === 0) return null;

  const growthRatio = lastInput / firstInput;
  if (growthRatio < 3) return null;

  // Estimate savings: if context had stayed at initial size, late messages would cost less
  const midpoint = Math.floor(entries.length / 2);
  const lateEntries = entries.slice(midpoint);
  let extraTokens = 0;
  for (const e of lateEntries) {
    const currentInput = e.input_tokens + e.cache_read_tokens;
    extraTokens += Math.max(0, currentInput - firstInput);
  }

  // Calculate CO2 of extra tokens using the dominant model
  const savingsResult = calculateCarbon({
    input_tokens: extraTokens,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    model: entries[entries.length - 1].model,
    provider: "claude",
    timestamp: "",
    session_id: "",
  }, region);

  if (savingsResult.co2_grams < 0.01) return null;

  return {
    severity: growthRatio > 5 ? "high" : "medium",
    pattern: "Context bloat",
    description: `Input tokens grew ${growthRatio.toFixed(1)}x over ${entries.length} messages (${firstInput.toLocaleString()} → ${lastInput.toLocaleString()})`,
    potential_savings_grams: Math.max(0, savingsResult.co2_grams),
    suggestion: "Start fresh sessions for new topics to keep context lean",
  };
}

/** Detect model over-selection: using expensive models for simple tasks. */
export function analyzeModelUsage(
  entries: TokenUsage[],
  region = "global",
): AuditFinding | null {
  const expensiveModels = entries.filter(
    (e) => e.model.toLowerCase().includes("opus"),
  );
  const simpleOnExpensive = expensiveModels.filter(
    (e) => e.output_tokens < 500,
  );

  if (simpleOnExpensive.length < 2) return null;

  let savings = 0;
  for (const e of simpleOnExpensive) {
    const actual = calculateCarbon(e, region).co2_grams;
    const ifHaiku = calculateCarbon({ ...e, model: "claude-haiku" }, region).co2_grams;
    savings += actual - ifHaiku;
  }

  if (savings < 0.01) return null;

  return {
    severity: savings > 1 ? "high" : "medium",
    pattern: "Short Opus turns",
    description: `${simpleOnExpensive.length} of ${entries.length} responses were under 500 output tokens — likely acknowledgements or tool-only turns`,
    potential_savings_grams: savings,
    suggestion: "Check whether these short turns needed a reply at all — often a batched follow-up avoids the round-trip",
  };
}

/** Detect redundant tool calls: same file read multiple times in a session. */
export function analyzeToolUsage(sessionFilePath: string, region = "global"): AuditFinding | null {
  if (!existsSync(sessionFilePath)) return null;

  const content = readFileSync(sessionFilePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());
  const fileReadCounts = new Map<string, number>();

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.type !== "assistant" || !parsed.message?.content) continue;

      for (const block of parsed.message.content) {
        if (block.type !== "tool_use") continue;
        if (block.name === "Read" && block.input?.file_path) {
          const path = block.input.file_path as string;
          fileReadCounts.set(path, (fileReadCounts.get(path) ?? 0) + 1);
        }
      }
    } catch {
      continue;
    }
  }

  const redundant = Array.from(fileReadCounts.entries())
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1]);

  if (redundant.length === 0) return null;

  const totalRedundantReads = redundant.reduce((s, [, c]) => s + c - 1, 0);
  // Each redundant read ≈ 2000 tokens of input
  const savingsResult = calculateCarbon({
    input_tokens: totalRedundantReads * 2000,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    model: "unknown",
    provider: "claude",
    timestamp: "",
    session_id: "",
  }, region);

  const topFiles = redundant.slice(0, 3)
    .map(([path, count]) => `${path.split("/").pop()} (${count}x)`)
    .join(", ");

  return {
    severity: "low",
    pattern: "Redundant file reads",
    description: `${redundant.length} files read 3+ times: ${topFiles}`,
    potential_savings_grams: savingsResult.co2_grams,
    suggestion: "Reference earlier reads instead of re-reading the same files",
  };
}
