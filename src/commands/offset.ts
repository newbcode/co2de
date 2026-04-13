import { readFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ClaudeAdapter } from "../adapters/claude/index.js";
import { OFFSET_COST } from "../core/constants.js";
import { getConfigDir } from "../core/config.js";
import { formatCO2 } from "../core/tone.js";
import { colors } from "../renderer/colors.js";
import { basename } from "node:path";
import type { OffsetEntry } from "../core/types.js";

const OFFSETS_PATH = join(getConfigDir(), "offsets.jsonl");

export async function offsetCommand(options: {
  log?: string;
}): Promise<void> {
  if (options.log) {
    logOffset(options.log);
    return;
  }

  const adapter = new ClaudeAdapter();
  const projectPath = process.cwd();
  const projectName = basename(projectPath);

  const sessions = await adapter.getProjectSessions(projectPath);
  const projectCO2 = sessions.reduce((s, ses) => s + ses.co2_grams, 0);

  // Get all-time CO2 for monthly estimate
  const now = new Date();
  const monthAgo = new Date(now);
  monthAgo.setDate(monthAgo.getDate() - 30);
  const allSessions = await adapter.listSessions(monthAgo, now);
  const monthlyCO2 = allSessions.reduce((s, ses) => s + ses.co2_grams, 0);

  console.log(colors.bold("\n\u{1F4A8} Offset Your Carbon Footprint\n"));

  console.log(`  Project: ${projectName} — ${formatCO2(projectCO2)} CO2`);
  console.log("");

  console.log(colors.bold("  To fully offset this project:"));
  const treeCost = projectCO2 * OFFSET_COST.tree_planting_usd_per_gram;
  const creditCost = projectCO2 * OFFSET_COST.carbon_credit_usd_per_gram;
  const renewCost = projectCO2 * OFFSET_COST.renewable_cert_usd_per_gram;

  console.log(`    \u{1F333} Plant ${(projectCO2 / 22000).toFixed(3)} trees       ~$${treeCost.toFixed(2)} via One Tree Planted`);
  console.log(`    \u{1F4A8} Buy carbon credits       ~$${creditCost.toFixed(2)} via Gold Standard`);
  console.log(`    \u{26A1} Renewable energy cert     ~$${renewCost.toFixed(3)}`);
  console.log("");

  if (monthlyCO2 > 0) {
    const monthlyTreeCost = monthlyCO2 * OFFSET_COST.tree_planting_usd_per_gram;
    console.log(`  This month (all projects): ~${formatCO2(monthlyCO2)} CO2`);
    console.log(`    \u{1F333} Plant ${(monthlyCO2 / 22000).toFixed(3)} trees         ~$${monthlyTreeCost.toFixed(2)}/month`);
    console.log("");
  }

  console.log(colors.bold("  Partners:"));
  console.log("    \u2192 onetreeplanted.org");
  console.log("    \u2192 goldstandard.org");
  console.log("    \u2192 climateactionreserve.org");
  console.log("");

  console.log(colors.dim('  Mark as offset:'));
  console.log(colors.dim('    co2de offset --log "Donated $1 to One Tree Planted"'));
  console.log("");

  // Show existing offsets
  const offsets = loadOffsets();
  if (offsets.length > 0) {
    console.log(colors.bold("  Offset history:"));
    for (const o of offsets.slice(-5)) {
      console.log(colors.dim(`    ${o.timestamp.slice(0, 10)} — ${o.note}`));
    }
    console.log("");
  }
}

function logOffset(note: string): void {
  const dir = getConfigDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const entry: OffsetEntry = {
    timestamp: new Date().toISOString(),
    project_path: process.cwd(),
    co2_grams_offset: 0, // user logs the action, not exact grams
    method: "manual",
    note,
  };

  appendFileSync(OFFSETS_PATH, JSON.stringify(entry) + "\n");
  console.log(colors.green(`  Offset logged: "${note}"`));
  console.log(colors.dim("  Your badge can now show (offset) status."));
}

function loadOffsets(): OffsetEntry[] {
  if (!existsSync(OFFSETS_PATH)) return [];
  try {
    return readFileSync(OFFSETS_PATH, "utf-8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}
