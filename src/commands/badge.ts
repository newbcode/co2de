import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { colors } from "../renderer/colors.js";
import { fmtCO2 } from "../renderer/format.js";
import { createContext } from "./shared.js";

const BADGE_MARKER_START = "<!-- co2de-badge:start -->";
const BADGE_MARKER_END = "<!-- co2de-badge:end -->";

function generateBadgeUrl(co2Grams: number): string {
  const co2Text = `~${fmtCO2(co2Grams)}`;
  const color = co2Grams > 1000 ? "red" : co2Grams > 100 ? "orange" : co2Grams > 10 ? "yellow" : "green";
  return `https://img.shields.io/badge/CO2-${encodeURIComponent(co2Text)}-${color}`;
}

function generateBadgeMarkdown(co2Grams: number): string {
  const url = generateBadgeUrl(co2Grams);
  return `[![co2de carbon badge](${url})](https://github.com/newbcode/co2de)`;
}

function generateBadgeBlock(co2Grams: number): string {
  return `${BADGE_MARKER_START}\n${generateBadgeMarkdown(co2Grams)}\n${BADGE_MARKER_END}`;
}

function injectBadge(readmePath: string, co2Grams: number): boolean {
  if (!existsSync(readmePath)) return false;

  const content = readFileSync(readmePath, "utf-8");
  const block = generateBadgeBlock(co2Grams);

  // Replace existing badge block
  const startIdx = content.indexOf(BADGE_MARKER_START);
  const endIdx = content.indexOf(BADGE_MARKER_END);

  let updated: string;
  if (startIdx !== -1 && endIdx !== -1) {
    // Update existing
    updated = content.slice(0, startIdx) + block + content.slice(endIdx + BADGE_MARKER_END.length);
  } else {
    // Insert after first heading (# title)
    const headingMatch = content.match(/^#\s+.+$/m);
    if (headingMatch && headingMatch.index !== undefined) {
      const insertAt = headingMatch.index + headingMatch[0].length;
      updated = content.slice(0, insertAt) + "\n\n" + block + content.slice(insertAt);
    } else {
      // No heading found, prepend
      updated = block + "\n\n" + content;
    }
  }

  writeFileSync(readmePath, updated);
  return true;
}

export async function badgeCommand(options: { inject?: boolean }): Promise<void> {
  const { adapter } = createContext();
  const projectPath = process.cwd();
  const projectName = basename(projectPath);

  const sessions = await adapter.getProjectSessions(projectPath);
  const totalCO2 = sessions.reduce((s, ses) => s + ses.co2_grams, 0);

  if (totalCO2 === 0) {
    console.log(colors.dim("  No CO2 data for this project."));
    return;
  }

  const markdown = generateBadgeMarkdown(totalCO2);

  console.log(colors.bold("\n\u{1F4A8} co2de Badge Generator\n"));
  console.log(`  Project: ${projectName}`);
  console.log(`  Total CO2: ~${fmtCO2(totalCO2)}`);
  console.log(`  Sessions: ${sessions.length}`);
  console.log("");

  if (options.inject) {
    const readmePath = join(projectPath, "README.md");
    const ok = injectBadge(readmePath, totalCO2);
    if (ok) {
      console.log(colors.green(`  Badge injected into README.md`));
      console.log(colors.dim(`  Run again to update the value.`));
    } else {
      console.log(colors.red(`  README.md not found at ${readmePath}`));
    }
  } else {
    console.log(colors.bold("  Badge for your README.md:"));
    console.log("");
    console.log(`  ${markdown}`);
    console.log("");
    console.log(colors.dim("  Or run `co2de badge --inject` to auto-insert into README.md"));
  }
  console.log("");
}
