import { ClaudeAdapter } from "../adapters/claude/index.js";
import { generateBadge } from "../export/badge-generator.js";
import { formatCO2 } from "../core/tone.js";
import { colors } from "../renderer/colors.js";
import { basename } from "node:path";

export async function badgeCommand(): Promise<void> {
  const adapter = new ClaudeAdapter();
  const projectPath = process.cwd();
  const projectName = basename(projectPath);

  const sessions = await adapter.getProjectSessions(projectPath);
  const totalCO2 = sessions.reduce((s, ses) => s + ses.co2_grams, 0);

  if (totalCO2 === 0) {
    console.log(colors.dim("  No CO2 data for this project."));
    return;
  }

  const badge = generateBadge(totalCO2, false);
  const offsetBadge = generateBadge(totalCO2, true);

  console.log(colors.bold("\n\u{1F4A8} co2de Badge Generator\n"));
  console.log(`  Project: ${projectName}`);
  console.log(`  Total CO2: ${formatCO2(totalCO2)}`);
  console.log("");

  console.log(colors.bold("  Badge for your README.md:"));
  console.log("");
  console.log(`  ${badge.markdown}`);
  console.log("");

  console.log(colors.bold("  After offsetting:"));
  console.log("");
  console.log(`  ${offsetBadge.markdown}`);
  console.log("");

  console.log(colors.dim("  Copy and paste into your README.md"));
  console.log("");
}
