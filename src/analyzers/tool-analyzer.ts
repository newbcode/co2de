import { readFileSync, existsSync } from "node:fs";
import type { AuditFinding } from "../core/types.js";

/**
 * Detect redundant tool calls: same file read multiple times in a session.
 */
export function analyzeToolUsage(sessionFilePath: string): AuditFinding | null {
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

  // Find files read 3+ times
  const redundant = Array.from(fileReadCounts.entries())
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1]);

  if (redundant.length === 0) return null;

  const totalRedundantReads = redundant.reduce((s, [, c]) => s + c - 1, 0);
  // Each redundant read is roughly ~2000 tokens of context
  const savingsGrams = totalRedundantReads * 2000 * 0.003 * 1.2 * 475 / 1_000_000;

  const topFiles = redundant.slice(0, 3)
    .map(([path, count]) => `${path.split("/").pop()} (${count}x)`)
    .join(", ");

  return {
    severity: "low",
    pattern: "Redundant file reads",
    description: `${redundant.length} files read 3+ times: ${topFiles}`,
    potential_savings_grams: savingsGrams,
    suggestion: "Reference earlier reads instead of re-reading the same files",
  };
}
