import { ClaudeAdapter } from "../adapters/claude/index.js";
import {
  parseSessionFile,
  countLinesWritten,
  listSessionFiles,
  listProjectDirs,
} from "../adapters/claude/jsonl-parser.js";
import {
  estimateHandCoding,
  estimateLinesFromTokens,
} from "../engine/handcode-estimator.js";
import { quickCO2 } from "../engine/carbon-calculator.js";
import { loadConfig } from "../core/config.js";
import { colors } from "../renderer/colors.js";
import { renderComparison } from "../renderer/components/comparison-chart.js";

export async function compareCommand(): Promise<void> {
  const adapter = new ClaudeAdapter();
  const config = loadConfig();

  // Find most recent session file
  const now = new Date();
  const dayAgo = new Date(now);
  dayAgo.setDate(dayAgo.getDate() - 1);

  const sessions = await adapter.listSessions(dayAgo, now);
  if (sessions.length === 0) {
    console.log(colors.dim("  No recent sessions found."));
    return;
  }

  const latest = sessions[0];

  // Find the actual JSONL file for line counting
  let linesWritten = 0;
  let sessionFilePath = "";

  for (const projectDir of listProjectDirs()) {
    const files = listSessionFiles(projectDir);
    for (const file of files) {
      if (file.includes(latest.id)) {
        linesWritten = countLinesWritten(file);
        sessionFilePath = file;
        break;
      }
    }
    if (sessionFilePath) break;
  }

  // Fall back to token-based estimate
  if (linesWritten === 0) {
    const entries = await adapter.getSessionUsage(latest.id);
    const totalOutput = entries.reduce((s, e) => s + e.output_tokens, 0);
    linesWritten = estimateLinesFromTokens(totalOutput);
  }

  // Estimate session duration from timestamps
  const entries = await adapter.getSessionUsage(latest.id);
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
