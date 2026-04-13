import type { TokenUsage, AuditFinding } from "../core/types.js";
import { quickCO2 } from "../engine/carbon-calculator.js";

/**
 * Detect model over-selection: using expensive models for simple tasks.
 * Simple tasks are defined as responses with < 500 output tokens.
 */
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
    // Only count input + output tokens for savings (not cache — cache size
    // is determined by conversation history, not model choice)
    const actual = quickCO2(e.input_tokens, e.output_tokens, e.model, region);
    const ifHaiku = quickCO2(e.input_tokens, e.output_tokens, "claude-haiku", region);
    savings += actual - ifHaiku;
  }

  if (savings < 0.01) return null;

  return {
    severity: savings > 1 ? "high" : "medium",
    pattern: "Model over-selection",
    description: `${simpleOnExpensive.length} of ${entries.length} responses were simple (<500 output tokens) but used an expensive model`,
    potential_savings_grams: savings,
    suggestion: "Use Haiku or Sonnet for simple tasks (file reads, short answers)",
  };
}
