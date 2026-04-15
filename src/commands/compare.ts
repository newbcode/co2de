import { countLinesWritten } from "../adapters/claude.js";
import {
  estimateHandCoding,
  estimateLinesFromTokens,
} from "../engine/handcode-estimator.js";
import { colors } from "../renderer/colors.js";
import { renderComparison } from "../renderer/display.js";
import { createContext, getLatestSession } from "./shared.js";

export async function compareCommand(): Promise<void> {
  const { config, adapter } = createContext();

  const result = await getLatestSession(adapter);
  if (!result) {
    console.log(colors.dim("  No recent sessions found."));
    return;
  }

  const { session: latest, entries } = result;

  // Find the actual JSONL file for line counting
  const sessionFilePath = adapter.findSessionFile(latest.id);
  let linesWritten = sessionFilePath ? countLinesWritten(sessionFilePath) : 0;

  // Fall back to token-based estimate
  if (linesWritten === 0) {
    const totalOutput = entries.reduce((s, e) => s + e.output_tokens, 0);
    linesWritten = estimateLinesFromTokens(totalOutput);
  }

  // Estimate session duration from timestamps
  let durationMinutes = 15; // default
  if (entries.length >= 2) {
    const first = new Date(entries[0].timestamp).getTime();
    const last = new Date(entries[entries.length - 1].timestamp).getTime();
    durationMinutes = Math.max(1, (last - first) / 60000);
  }

  const comparison = estimateHandCoding(
    linesWritten,
    latest.co2_grams,
    latest.total_tokens,
    durationMinutes,
    config.region,
  );

  console.log("");
  console.log(renderComparison(comparison));
  console.log("");
}
