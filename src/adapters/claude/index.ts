import type { TokenAdapter } from "../adapter.js";
import type { TokenUsage, SessionSummary } from "../../core/types.js";
import {
  parseSessionFile,
  getProjectDir,
  listSessionFiles,
  getSessionSummary,
  listProjectDirs,
} from "./jsonl-parser.js";

/**
 * Claude CLI adapter — reads token usage from local JSONL session files.
 *
 * Data source: ~/.claude/projects/<encoded-path>/<session-id>.jsonl
 * Each file contains one session's conversation with token usage per assistant message.
 */
export class ClaudeAdapter implements TokenAdapter {
  readonly provider = "claude";

  async getSessionUsage(sessionId: string): Promise<TokenUsage[]> {
    // Search all project dirs for a matching session file
    for (const projectDir of listProjectDirs()) {
      const files = listSessionFiles(projectDir);
      for (const file of files) {
        if (file.includes(sessionId)) {
          return parseSessionFile(file);
        }
      }
    }
    return [];
  }

  async listSessions(from: Date, to: Date): Promise<SessionSummary[]> {
    const summaries: SessionSummary[] = [];

    for (const projectDir of listProjectDirs()) {
      const files = listSessionFiles(projectDir);
      for (const file of files) {
        const summary = getSessionSummary(file);
        if (!summary) continue;

        const ts = new Date(summary.timestamp);
        if (ts >= from && ts <= to) {
          summaries.push(summary);
        }
      }
    }

    return summaries.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }

  async getProjectSessions(
    projectPath: string,
  ): Promise<SessionSummary[]> {
    const projectDir = getProjectDir(projectPath);
    const files = listSessionFiles(projectDir);
    const summaries: SessionSummary[] = [];

    for (const file of files) {
      const summary = getSessionSummary(file);
      if (summary) summaries.push(summary);
    }

    return summaries.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }

  async isAvailable(): Promise<boolean> {
    return listProjectDirs().length > 0;
  }
}
