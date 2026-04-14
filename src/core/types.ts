/** Token usage from a single AI interaction */
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  model: string;
  provider: string;
  timestamp: string; // ISO 8601
  session_id: string;
}

/** Result of carbon calculation for a set of tokens */
export interface CarbonResult {
  usage: TokenUsage;
  energy_wh: number;
  co2_grams: number;
  equivalents: MetaphorSet;
}

/** Human-relatable comparisons for CO2 amounts */
export interface MetaphorSet {
  tree_absorption_seconds: number;
  car_drive_meters: number;
  phone_charges: number;
  google_searches: number;
  netflix_streaming_seconds: number;
  led_bulb_hours: number;
}

/** Summary for listing sessions */
export interface SessionSummary {
  id: string;
  provider: string;
  model: string;
  timestamp: string;
  total_tokens: number;
  co2_grams: number;
  cost_usd: number;
}

/** Hand-coding vs AI-coding comparison */
export interface CodingComparison {
  ai_co2_grams: number;
  ai_time_minutes: number;
  ai_tokens: number;
  hand_co2_grams: number;
  hand_time_minutes: number;
  lines_of_code: number;
  multiplier: number; // ai_co2 / hand_co2
}

/** Carbon savings tracking */
export interface SavingsReport {
  period: string;
  actual_co2_grams: number;
  worst_case_co2_grams: number;
  saved_co2_grams: number;
  savings_breakdown: SavingsBreakdownItem[];
  lifetime_saved_grams: number;
}

export interface SavingsBreakdownItem {
  category: string;
  description: string;
  saved_grams: number;
}

/** Audit finding from efficiency analysis */
export interface AuditFinding {
  severity: "high" | "medium" | "low";
  pattern: string;
  description: string;
  potential_savings_grams: number;
  suggestion: string;
}

/** Bundled data for HTML report generation */
export interface ReportData {
  sessions: SessionSummary[];
  tokenEntries: TokenUsage[];
  savings: SavingsReport;
  config: Co2deConfig;
  metaphors: MetaphorSet;
  totalCO2: number;
  totalTokens: number;
  totalEnergyWh: number;
  period: string;
  generatedAt: string;
}

/** User configuration */
export interface Co2deConfig {
  region: string;
  daily_budget_grams: number | null;
  display: {
    compact: boolean;
    no_emoji: boolean;
  };
}

/** Emission level for design tone system */
export type EmissionLevel = "low" | "medium" | "high" | "extreme";
