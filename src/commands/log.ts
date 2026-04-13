import { ClaudeAdapter } from "../adapters/claude/index.js";
import { formatCO2, getToneMessage } from "../core/tone.js";
import { colors, BAR } from "../renderer/colors.js";
import { getEmissionLevel } from "../core/tone.js";
import { colorForLevel } from "../renderer/colors.js";

export async function logCommand(): Promise<void> {
  const adapter = new ClaudeAdapter();
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const sessions = await adapter.listSessions(weekAgo, now);

  if (sessions.length === 0) {
    console.log(colors.dim("  No sessions in the past 7 days."));
    return;
  }

  console.log("");

  const maxCO2 = Math.max(...sessions.map((s) => s.co2_grams), 1);

  for (const s of sessions) {
    const shortId = s.id.slice(0, 7);
    const timeAgo = formatTimeAgo(new Date(s.timestamp));
    const model = shortModelName(s.model);
    const tokens = s.total_tokens.toLocaleString();
    const co2 = formatCO2(s.co2_grams);

    // Mini bar
    const barWidth = 8;
    const filled = Math.round((s.co2_grams / maxCO2) * barWidth);
    const empty = barWidth - filled;
    const level = getEmissionLevel(s.co2_grams);
    const barColor = colorForLevel(level);
    const bar = barColor(BAR.filled.repeat(filled)) + colors.dim(BAR.empty.repeat(empty));

    console.log(
      `  ${colors.dim(shortId)}  ${timeAgo.padEnd(14)}${colors.magenta(model.padEnd(8))}  ${tokens.padStart(10)} tok  ${co2.padStart(7)}  ${bar}`,
    );
  }

  // Total
  const totalCO2 = sessions.reduce((s, ses) => s + ses.co2_grams, 0);
  const totalTokens = sessions.reduce((s, ses) => s + ses.total_tokens, 0);
  console.log("");
  console.log(
    `  This week: ${formatCO2(totalCO2)} across ${sessions.length} sessions (${totalTokens.toLocaleString()} tokens)`,
  );
  console.log("");
}

function formatTimeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hr ago`;
  return `${days}d ago`;
}

function shortModelName(model: string): string {
  if (model.includes("opus")) return "Opus4";
  if (model.includes("sonnet")) return "S4.5";
  if (model.includes("haiku")) return "Haiku";
  return model.slice(0, 8);
}
