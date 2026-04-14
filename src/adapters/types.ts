import type { TokenUsage, SessionSummary } from "../core/types.js";

/**
 * Adapter interface for different AI providers.
 *
 * Each provider (Claude, Gemini, etc.) implements this interface
 * to normalize token usage data into the common co2de format.
 */
export interface TokenAdapter {
  readonly provider: string;

  /** Retrieve token usage entries for a specific session */
  getSessionUsage(sessionId: string): Promise<TokenUsage[]>;

  /** List sessions within a date range */
  listSessions(from: Date, to: Date): Promise<SessionSummary[]>;

  /** List all sessions for a specific project path */
  getProjectSessions(projectPath: string): Promise<SessionSummary[]>;

  /** Check if this adapter is available (e.g., data files exist) */
  isAvailable(): Promise<boolean>;
}
