import { ClaudeAdapter } from "../adapters/claude/index.js";
import { renderDashboard } from "../renderer/components/dashboard.js";

export async function dashboardCommand(): Promise<void> {
  const adapter = new ClaudeAdapter();
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const sessions = await adapter.listSessions(weekAgo, now);

  // Build 7-day entries
  const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const days: Array<{ label: string; co2_grams: number; sessions: number }> = [];

  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().slice(0, 10);
    const label = dayNames[date.getDay()];

    const daySessions = sessions.filter(
      (s) => s.timestamp.slice(0, 10) === dateStr,
    );

    days.push({
      label,
      co2_grams: daySessions.reduce((s, ses) => s + ses.co2_grams, 0),
      sessions: daySessions.length,
    });
  }

  const todayLabel = dayNames[now.getDay()];

  console.log("");
  console.log(renderDashboard(days, todayLabel));
  console.log("");
}
