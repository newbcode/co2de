import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { colors } from "../renderer/colors.js";
import { createContext, collectAllEntries } from "./shared.js";
import { svgBadge, paceColor, fmtBadgePace, BADGE_COLORS } from "../badges/svg.js";
import { computePractice, countProjectLinesWritten, type PracticeBadge } from "../badges/practice.js";

type BadgeType = "pace" | "lean" | "stable" | "concise" | "disclosed" | "all";

const BADGE_MARKER_START = "<!-- co2de-badge:start -->";
const BADGE_MARKER_END = "<!-- co2de-badge:end -->";

/**
 * Pick an annualized pace for the project from the past 30 days.
 * Falls back to lifetime rate if no recent activity.
 */
function computeProjectPace(sessions: { co2_grams: number; timestamp: string }[]): number {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 3600 * 1000;
  const recent = sessions.filter((s) => new Date(s.timestamp).getTime() >= thirtyDaysAgo);

  if (recent.length > 0) {
    const total = recent.reduce((s, x) => s + x.co2_grams, 0);
    return (total / 30) * 365;
  }
  if (sessions.length === 0) return 0;
  const firstTs = Math.min(...sessions.map((s) => new Date(s.timestamp).getTime()));
  const daysSpan = Math.max(1, (now - firstTs) / (24 * 3600 * 1000));
  const total = sessions.reduce((s, x) => s + x.co2_grams, 0);
  return (total / daysSpan) * 365;
}

/** Render an SVG for the pace badge. */
function paceBadgeSvg(annualGrams: number): string {
  const label = "CO\u2082";
  const value = fmtBadgePace(annualGrams);
  return svgBadge(label, value, paceColor(annualGrams));
}

/** Render an SVG for a practice badge. */
function practiceBadgeSvg(b: PracticeBadge): string {
  const color = b.key === "disclosed" ? BADGE_COLORS.rust : BADGE_COLORS.charcoal;
  return svgBadge(b.label, b.value, color);
}

interface BadgeAssets {
  pace: { svg: string; filename: string; label: string; pace: number };
  practice: { svg: string; filename: string; badge: PracticeBadge }[];
}

/**
 * Build all badge SVG assets for the current project.
 * Always includes pace + disclosed; practice badges included when they
 * qualify (or always, with a muted color, if --all is requested).
 */
async function buildBadgeAssets(projectPath: string, includeAll: boolean): Promise<BadgeAssets | null> {
  const { adapter } = createContext();

  const sessions = await adapter.getProjectSessions(projectPath);
  if (sessions.length === 0) return null;

  const annualPace = computeProjectPace(sessions);
  const pace = {
    svg: paceBadgeSvg(annualPace),
    filename: "pace.svg",
    label: fmtBadgePace(annualPace),
    pace: annualPace,
  };

  // Practice badges — use this project's recent sessions + their entries.
  const thirtyDaysAgo = Date.now() - 30 * 86400_000;
  const recentProject = sessions.filter((s) => new Date(s.timestamp).getTime() >= thirtyDaysAgo);
  const entries = await collectAllEntries(adapter, recentProject);
  const linesWritten = countProjectLinesWritten(projectPath);

  const practice = computePractice({
    sessions: recentProject,
    entries,
    linesWritten,
  });

  const practiceAssets = practice
    .filter((b) => includeAll || b.qualifies)
    .map((b) => ({
      svg: practiceBadgeSvg(b),
      filename: `${b.key}.svg`,
      badge: b,
    }));

  return { pace, practice: practiceAssets };
}

function injectBadge(readmePath: string, block: string): boolean {
  if (!existsSync(readmePath)) return false;

  const content = readFileSync(readmePath, "utf-8");
  const startIdx = content.indexOf(BADGE_MARKER_START);
  const endIdx = content.indexOf(BADGE_MARKER_END);

  const wrapped = `${BADGE_MARKER_START}\n${block}\n${BADGE_MARKER_END}`;

  let updated: string;
  if (startIdx !== -1 && endIdx !== -1) {
    updated = content.slice(0, startIdx) + wrapped + content.slice(endIdx + BADGE_MARKER_END.length);
  } else {
    const headingMatch = content.match(/^#\s+.+$/m);
    if (headingMatch && headingMatch.index !== undefined) {
      const insertAt = headingMatch.index + headingMatch[0].length;
      updated = content.slice(0, insertAt) + "\n\n" + wrapped + content.slice(insertAt);
    } else {
      updated = wrapped + "\n\n" + content;
    }
  }

  writeFileSync(readmePath, updated);
  return true;
}

function saveAssets(projectPath: string, assets: BadgeAssets, types: BadgeType[]): string[] {
  const co2deDir = join(projectPath, ".co2de");
  if (!existsSync(co2deDir)) mkdirSync(co2deDir, { recursive: true });

  const saved: string[] = [];
  const wantAll = types.includes("all");
  const wantPace = wantAll || types.includes("pace");
  const paceFilePath = join(co2deDir, assets.pace.filename);
  if (wantPace) {
    writeFileSync(paceFilePath, assets.pace.svg);
    saved.push(paceFilePath);
  }
  for (const p of assets.practice) {
    if (!wantAll && !types.includes(p.badge.key)) continue;
    const fp = join(co2deDir, p.filename);
    writeFileSync(fp, p.svg);
    saved.push(fp);
  }
  return saved;
}

export async function badgeCommand(options: {
  type?: BadgeType;
  save?: boolean;
  inject?: boolean;
}): Promise<void> {
  const projectPath = process.cwd();
  const projectName = basename(projectPath);
  const type = (options.type ?? "pace") as BadgeType;
  const includeAll = type === "all";

  const assets = await buildBadgeAssets(projectPath, includeAll);
  if (!assets) {
    console.log(colors.dim("  No CO\u2082 data for this project."));
    return;
  }

  console.log(colors.bold("\n  co2de badge\n"));
  console.log(`  Project: ${projectName}`);
  console.log(`  Pace:    ${assets.pace.label} ${colors.dim("(annualized)")}`);

  const qualified = assets.practice.filter((p) => p.badge.qualifies);
  if (qualified.length > 0) {
    console.log(`  Qualifying practice badges:`);
    for (const p of qualified) {
      console.log(`    ${colors.bold(p.badge.label)}  ${colors.dim(p.badge.value)}`);
    }
  }
  console.log("");

  // Single-type info path
  if (!options.save && !options.inject) {
    if (type === "all") {
      console.log(colors.bold("  Markdown for README (all qualifying):"));
      console.log("");
      console.log(`  ![CO\u2082](.co2de/pace.svg)${assets.practice
        .filter((p) => p.badge.qualifies)
        .map((p) => ` ![${p.badge.label}](.co2de/${p.filename})`)
        .join("")}`);
      console.log("");
      console.log(colors.dim("  Run  co2de badge --save --type all  to write the SVG files."));
      console.log(colors.dim("  Or use  co2de readme  for a one-shot README block (recommended)."));
    } else {
      console.log(colors.bold(`  Markdown for the ${type} badge:`));
      console.log("");
      const relPath = type === "pace" ? "pace.svg" : `${type}.svg`;
      console.log(`  ![${type}](.co2de/${relPath})`);
      console.log("");
      console.log(colors.dim(`  Run  co2de badge --save --type ${type}  to write the SVG.`));
    }
    console.log("");
    return;
  }

  const typesToWrite: BadgeType[] = includeAll
    ? ["all"]
    : [type];

  if (options.save || options.inject) {
    const saved = saveAssets(projectPath, assets, typesToWrite);
    console.log(`  Wrote ${saved.length} SVG file${saved.length === 1 ? "" : "s"} to .co2de/`);
    for (const s of saved) console.log(colors.dim(`    ${s}`));
  }

  if (options.inject) {
    const mdParts: string[] = [];
    if (typesToWrite.includes("all") || typesToWrite.includes("pace")) {
      mdParts.push(`![CO\u2082](.co2de/pace.svg)`);
    }
    for (const p of assets.practice) {
      if (!includeAll && !typesToWrite.includes(p.badge.key)) continue;
      if (!includeAll && !p.badge.qualifies && p.badge.key !== "disclosed") continue;
      mdParts.push(`![${p.badge.label}](.co2de/${p.filename})`);
    }
    const block = mdParts.join(" ");
    const readmePath = join(projectPath, "README.md");
    const ok = injectBadge(readmePath, block);
    console.log("");
    if (ok) {
      console.log(`  Injected badge block into README.md`);
      console.log(colors.dim("  Re-run to refresh after new sessions."));
    } else {
      console.log(colors.red(`  README.md not found at ${readmePath}`));
    }
  }

  console.log("");
}
