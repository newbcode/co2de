import { renderHeatmap } from "../renderer/charts.js";
import { createContext, daysAgo } from "./shared.js";

export async function heatmapCommand(): Promise<void> {
  const { adapter } = createContext();
  const now = new Date();

  const sessions = await adapter.listSessions(daysAgo(30), now);

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
  console.log(renderHeatmap(data, "\u{1F4A8} CO\u2082 Heatmap — Past 30 Days"));
  console.log("");
}
