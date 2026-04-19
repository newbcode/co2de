import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { colors } from "../renderer/colors.js";
import { createContext, collectAllEntries } from "./shared.js";
import { svgBadge, paceColor, fmtBadgePace, BADGE_COLORS } from "../badges/svg.js";
import { computePractice, countProjectLinesWritten, type PracticeBadge } from "../badges/practice.js";
import { renderCalendarSVG, type PrivacyLevel } from "../badges/calendar-svg.js";

const VALID_PRIVACY: readonly PrivacyLevel[] = ["full", "bucketed", "weekly", "disclosed"];
import { buildDashboardData, pickFeaturedSession } from "../dashboard/data.js";
import { collectProjectSessions } from "../adapters/claude.js";
import { renderDisclosureHTML } from "../disclosure/html.js";

const BLOCK_START = "<!-- co2de:start -->";
const BLOCK_END = "<!-- co2de:end -->";

interface ReadmeOptions {
  show?: PrivacyLevel;
  remove?: boolean;
}

function computeProjectPace(sessions: { co2_grams: number; timestamp: string }[]): number {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 86400_000;
  const recent = sessions.filter((s) => new Date(s.timestamp).getTime() >= thirtyDaysAgo);
  if (recent.length > 0) {
    const total = recent.reduce((s, x) => s + x.co2_grams, 0);
    return (total / 30) * 365;
  }
  if (sessions.length === 0) return 0;
  const firstTs = Math.min(...sessions.map((s) => new Date(s.timestamp).getTime()));
  const daysSpan = Math.max(1, (now - firstTs) / 86400_000);
  const total = sessions.reduce((s, x) => s + x.co2_grams, 0);
  return (total / daysSpan) * 365;
}

function practiceBadgeSvg(b: PracticeBadge): string {
  const color = b.key === "disclosed" ? BADGE_COLORS.rust : BADGE_COLORS.charcoal;
  return svgBadge(b.label, b.value, color);
}

function removeBlock(readmePath: string): boolean {
  if (!existsSync(readmePath)) return false;
  const content = readFileSync(readmePath, "utf-8");
  const startIdx = content.indexOf(BLOCK_START);
  const endIdx = content.indexOf(BLOCK_END);
  if (startIdx === -1 || endIdx === -1) return false;
  const end = endIdx + BLOCK_END.length;
  // Eat a trailing newline if present so removal leaves no orphan blank
  const trailingNL = content[end] === "\n" ? 1 : 0;
  const updated = content.slice(0, startIdx) + content.slice(end + trailingNL);
  writeFileSync(readmePath, updated);
  return true;
}

function injectBlock(readmePath: string, block: string): boolean {
  if (!existsSync(readmePath)) {
    // Create a minimal README if none exists
    writeFileSync(readmePath, `# ${basename(process.cwd())}\n\n${BLOCK_START}\n${block}\n${BLOCK_END}\n`);
    return true;
  }
  const content = readFileSync(readmePath, "utf-8");
  const wrapped = `${BLOCK_START}\n${block}\n${BLOCK_END}`;
  const startIdx = content.indexOf(BLOCK_START);
  const endIdx = content.indexOf(BLOCK_END);

  let updated: string;
  if (startIdx !== -1 && endIdx !== -1) {
    updated = content.slice(0, startIdx) + wrapped + content.slice(endIdx + BLOCK_END.length);
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

/**
 * co2de readme — one command, one README block.
 *
 *   co2de readme                   inject default (bucketed calendar) block
 *   co2de readme --show full       daily tooltips in calendar
 *   co2de readme --show bucketed   daily cells without exact numbers (default)
 *   co2de readme --show weekly     weekly aggregate (strong privacy)
 *   co2de readme --show disclosed  badges only, no calendar
 *   co2de readme --remove          delete the block from README
 */
export async function readmeCommand(options: ReadmeOptions): Promise<void> {
  const projectPath = process.cwd();
  const readmePath = join(projectPath, "README.md");

  if (options.remove) {
    const ok = removeBlock(readmePath);
    console.log("");
    console.log(ok
      ? `  Removed co2de block from README.md.`
      : `  No co2de block found in README.md.`);
    console.log("");
    return;
  }

  // Validate --show at runtime — commander accepts any string, but an
  // invalid privacy level would silently fall through to the bucketed
  // path and surprise the user.
  const rawShow = options.show ?? "bucketed";
  if (!VALID_PRIVACY.includes(rawShow as PrivacyLevel)) {
    console.log("");
    console.log(colors.red(`  Invalid --show value: "${rawShow}"`));
    console.log(colors.dim(`  Valid: ${VALID_PRIVACY.join(" · ")}`));
    console.log("");
    return;
  }
  const privacy = rawShow as PrivacyLevel;
  const { config, adapter } = createContext();

  // ── Data collection ──────────────────────────────────────
  const sessions = await adapter.getProjectSessions(projectPath);
  if (sessions.length === 0) {
    console.log(colors.dim("  No CO\u2082 data for this project yet."));
    console.log(colors.dim("  Run a Claude Code session in this directory first."));
    return;
  }

  const now = new Date();
  const thirtyDaysAgo = Date.now() - 30 * 86400_000;
  const recentSessions = sessions.filter((s) => new Date(s.timestamp).getTime() >= thirtyDaysAgo);
  const entries = await collectAllEntries(adapter, recentSessions);
  const linesWritten = countProjectLinesWritten(projectPath);

  const pace = computeProjectPace(sessions);
  const practice = computePractice({
    sessions: recentSessions,
    entries,
    linesWritten,
  });

  // Calendar shows THIS project only — README is per-repo.
  const from = new Date(now);
  from.setDate(from.getDate() - 365);
  const projectDetailed = collectProjectSessions(projectPath, from, now, config.region);
  const featured = pickFeaturedSession(projectDetailed);
  let dashData: ReturnType<typeof buildDashboardData> | null = null;
  if (featured) {
    const featuredTurns = await adapter.getSessionUsage(featured.sessionId);
    if (featuredTurns.length > 0) {
      dashData = buildDashboardData(projectDetailed, featured, featuredTurns, config.region);
    }
  }

  // ── Asset generation ─────────────────────────────────────
  const co2deDir = join(projectPath, ".co2de");
  try {
    if (!existsSync(co2deDir)) mkdirSync(co2deDir, { recursive: true });
  } catch (err) {
    console.log(colors.red(`  Failed to create ${co2deDir}: ${err instanceof Error ? err.message : String(err)}`));
    return;
  }

  const assets: string[] = [];
  function write(filePath: string, content: string): boolean {
    try {
      writeFileSync(filePath, content);
      assets.push(filePath);
      return true;
    } catch (err) {
      console.log(colors.red(`  Failed to write ${filePath}: ${err instanceof Error ? err.message : String(err)}`));
      return false;
    }
  }

  // 1. Pace badge
  const paceSvg = svgBadge("CO\u2082", fmtBadgePace(pace), paceColor(pace));
  if (!write(join(co2deDir, "pace.svg"), paceSvg)) return;

  // 2. Practice badges (only qualifying ones)
  const qualifying = practice.filter((p) => p.qualifies);
  for (const b of qualifying) {
    if (!write(join(co2deDir, `${b.key}.svg`), practiceBadgeSvg(b))) return;
  }

  // 3. Calendar SVG (skipped if privacy = disclosed)
  let hasCalendar = false;
  if (dashData && privacy !== "disclosed") {
    const svg = renderCalendarSVG(
      dashData.calendar,
      dashData.calendarTotalKg,
      dashData.calendarSessions,
      privacy,
    );
    if (svg && write(join(co2deDir, "calendar.svg"), svg)) {
      hasCalendar = true;
    }
  }

  // 4. Disclosure HTML
  const disclosureHTML = renderDisclosureHTML({
    projectName: basename(projectPath),
    pace,
    practice,
    dashData,
    privacy,
    linesWritten,
    region: config.region,
  });
  if (!write(join(co2deDir, "disclosure.html"), disclosureHTML)) return;

  // ── Build README block ───────────────────────────────────
  const badgeRow: string[] = [`![CO\u2082](.co2de/pace.svg)`];
  for (const b of qualifying) {
    badgeRow.push(`![${b.label}](.co2de/${b.key}.svg)`);
  }

  const blockParts: string[] = [];
  blockParts.push(badgeRow.join(" "));
  if (hasCalendar) {
    blockParts.push("");
    blockParts.push(`![carbon footprint](.co2de/calendar.svg)`);
  }
  blockParts.push("");
  const today = now.toISOString().slice(0, 10);
  blockParts.push(`[carbon disclosure](.co2de/disclosure.html) · privacy \`${privacy}\` · updated ${today}`);

  const block = blockParts.join("\n");
  try {
    injectBlock(readmePath, block);
  } catch (err) {
    console.log(colors.red(`  Failed to update README.md: ${err instanceof Error ? err.message : String(err)}`));
    return;
  }

  // ── Report ───────────────────────────────────────────────
  console.log(colors.bold("\n  co2de readme\n"));
  console.log(`  Privacy:  ${privacy}`);
  console.log(`  Pace:     ${fmtBadgePace(pace)}`);
  console.log(`  Badges:   ${qualifying.map((q) => q.label).join(" · ") || "disclosed"}`);
  if (hasCalendar) console.log(`  Calendar: ${privacy === "weekly" ? "weekly" : "daily"} · ${dashData?.calendarSessions ?? 0} sessions`);
  console.log("");
  console.log(colors.dim(`  Wrote ${assets.length} asset${assets.length === 1 ? "" : "s"} to .co2de/`));
  console.log(colors.dim(`  Injected block into README.md`));
  console.log("");
  console.log(colors.dim("  To remove:  co2de readme --remove"));
  console.log(colors.dim("  To refresh: co2de readme   (same flags)"));
  console.log("");
}
