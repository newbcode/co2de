import {
  readFileSync,
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "../core/config.js";
import type { SessionSummary } from "../core/types.js";

function getSessionsDir(): string {
  return join(getConfigDir(), "sessions");
}

function getSessionFile(date: string): string {
  return join(getSessionsDir(), `${date}.jsonl`);
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Append a session summary to today's session file.
 */
export function saveSession(summary: SessionSummary): void {
  const dir = getSessionsDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const filePath = getSessionFile(todayString());
  appendFileSync(filePath, JSON.stringify(summary) + "\n");
}

/**
 * Load all sessions for a specific date.
 */
export function loadSessionsByDate(date: string): SessionSummary[] {
  const filePath = getSessionFile(date);
  if (!existsSync(filePath)) return [];

  const lines = readFileSync(filePath, "utf-8")
    .split("\n")
    .filter((l) => l.trim());

  const sessions: SessionSummary[] = [];
  for (const line of lines) {
    try {
      sessions.push(JSON.parse(line));
    } catch {
      continue;
    }
  }
  return sessions;
}

/**
 * Load sessions for a date range.
 */
export function loadSessionsInRange(
  from: Date,
  to: Date,
): SessionSummary[] {
  const dir = getSessionsDir();
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  const sessions: SessionSummary[] = [];

  for (const file of files) {
    const dateStr = file.replace(".jsonl", "");
    const fileDate = new Date(dateStr);
    if (fileDate >= from && fileDate <= to) {
      sessions.push(...loadSessionsByDate(dateStr));
    }
  }

  return sessions.sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

/**
 * Load all sessions ever recorded.
 */
export function loadAllSessions(): SessionSummary[] {
  const dir = getSessionsDir();
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  const sessions: SessionSummary[] = [];

  for (const file of files) {
    const dateStr = file.replace(".jsonl", "");
    sessions.push(...loadSessionsByDate(dateStr));
  }

  return sessions.sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

/**
 * Get total CO2 for today.
 */
export function getTodayCO2(): number {
  const sessions = loadSessionsByDate(todayString());
  return sessions.reduce((sum, s) => sum + s.co2_grams, 0);
}

/**
 * Get dates that have session data.
 */
export function getSessionDates(): string[] {
  const dir = getSessionsDir();
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => f.replace(".jsonl", ""))
    .sort();
}
