import { ClaudeAdapter } from "../adapters/claude/index.js";
import { renderHeatmap } from "../renderer/components/heatmap.js";

export async function heatmapCommand(): Promise<void> {
  const adapter = new ClaudeAdapter();
  const now = new Date();
  const monthAgo = new Date(now);
  monthAgo.setDate(monthAgo.getDate() - 30);

  const sessions = await adapter.listSessions(monthAgo, now);

  // Aggregate by day
  const dayMap = new Map<string, number>();
  for (const s of sessions) {
    const date = s.timestamp.slice(0, 10);
    dayMap.set(date, (dayMap.get(date) ?? 0) + s.co2_grams);
  }

  const data = Array.from(dayMap.entries()).map(([date, co2]) => ({
    date,
    co2_grams: co2,
  }));

  console.log("");
  console.log(renderHeatmap(data, "\u{1F4A8} CO2 Heatmap — Past 30 Days"));
  console.log("");
}
