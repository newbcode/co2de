import type { TokenAdapter } from "../../src/adapters/types.js";
import type { TokenUsage, SessionSummary } from "../../src/core/types.js";

/**
 * In-memory mock adapter for testing.
 */
export class MockAdapter implements TokenAdapter {
  readonly provider = "mock";
  private sessions: Map<string, TokenUsage[]> = new Map();
  private summaries: SessionSummary[] = [];

  addSession(id: string, entries: TokenUsage[], summary: SessionSummary): void {
    this.sessions.set(id, entries);
    this.summaries.push(summary);
  }

  async getSessionUsage(sessionId: string): Promise<TokenUsage[]> {
    return this.sessions.get(sessionId) ?? [];
  }

  async listSessions(from: Date, to: Date): Promise<SessionSummary[]> {
    return this.summaries.filter((s) => {
      const ts = new Date(s.timestamp);
      return ts >= from && ts <= to;
    });
  }

  async getProjectSessions(): Promise<SessionSummary[]> {
    return this.summaries;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

export function createMockEntry(overrides: Partial<TokenUsage> = {}): TokenUsage {
  return {
    input_tokens: 1000,
    output_tokens: 500,
    cache_read_tokens: 200,
    cache_write_tokens: 100,
    model: "claude-sonnet-4-20250514",
    provider: "mock",
    timestamp: new Date().toISOString(),
    session_id: "test-session",
    ...overrides,
  };
}
