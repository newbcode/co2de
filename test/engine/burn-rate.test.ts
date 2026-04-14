import { describe, it, expect } from "vitest";
import { calculateBurnRate } from "../../src/engine/burn-rate.js";
import { createMockEntry } from "../helpers/mock-adapter.js";

describe("calculateBurnRate", () => {
  it("returns null for empty entries", () => {
    expect(calculateBurnRate([])).toBeNull();
  });

  it("returns null for single entry", () => {
    expect(calculateBurnRate([createMockEntry()])).toBeNull();
  });

  it("returns null when timestamps are too close", () => {
    const now = new Date().toISOString();
    const entries = [
      createMockEntry({ timestamp: now }),
      createMockEntry({ timestamp: now }),
    ];
    expect(calculateBurnRate(entries)).toBeNull();
  });

  it("calculates burn rate for entries spanning time", () => {
    const t1 = new Date("2026-01-01T10:00:00Z").toISOString();
    const t2 = new Date("2026-01-01T10:10:00Z").toISOString(); // 10 min later
    const entries = [
      createMockEntry({ timestamp: t1, input_tokens: 5000, output_tokens: 2000 }),
      createMockEntry({ timestamp: t2, input_tokens: 5000, output_tokens: 2000 }),
    ];

    const result = calculateBurnRate(entries);
    expect(result).not.toBeNull();
    expect(result!.session_duration_minutes).toBeCloseTo(10, 0);
    expect(result!.tokens_per_minute).toBeGreaterThan(0);
    expect(result!.co2_per_hour).toBeGreaterThan(0);
    expect(result!.cost_per_hour).toBeGreaterThan(0);
  });
});
