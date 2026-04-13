import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SessionSummary } from "../core/types.js";
import { renderHTMLReport } from "./template.js";

export function generateHTMLReport(
  sessions: SessionSummary[],
  outputDir: string,
  period: string,
): string {
  // Aggregate
  let totalCO2 = 0;
  let totalTokens = 0;
  for (const s of sessions) {
    totalCO2 += s.co2_grams;
    totalTokens += s.total_tokens;
  }

  // Daily aggregation
  const dayMap = new Map<string, number>();
  for (const s of sessions) {
    const date = s.timestamp.slice(0, 10);
    dayMap.set(date, (dayMap.get(date) ?? 0) + s.co2_grams);
  }
  const dailyData = Array.from(dayMap.entries())
    .map(([date, co2]) => ({ date, co2 }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Model breakdown
  const modelMap = new Map<string, { co2: number; tokens: number }>();
  for (const s of sessions) {
    const existing = modelMap.get(s.model) ?? { co2: 0, tokens: 0 };
    existing.co2 += s.co2_grams;
    existing.tokens += s.total_tokens;
    modelMap.set(s.model, existing);
  }
  const modelBreakdown = Array.from(modelMap.entries())
    .map(([model, data]) => ({ model, ...data }))
    .sort((a, b) => b.co2 - a.co2);

  const html = renderHTMLReport({
    title: `co2de Carbon Report — ${period}`,
    period,
    totalCO2,
    totalTokens,
    totalSessions: sessions.length,
    sessions: sessions.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    ),
    dailyData,
    modelBreakdown,
  });

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `co2de-report-${dateStr}.html`;
  const filePath = join(outputDir, filename);

  writeFileSync(filePath, html);
  return filePath;
}
