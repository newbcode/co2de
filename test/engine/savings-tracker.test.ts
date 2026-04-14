import { describe, it, expect } from "vitest";
import { calculateSavings } from "../../src/engine/savings-tracker.js";
import { createMockEntry } from "../helpers/mock-adapter.js";

describe("calculateSavings", () => {
  it("returns zeros for empty entries", () => {
    const result = calculateSavings([]);
    expect(result.actual_co2_grams).toBe(0);
    expect(result.worst_case_co2_grams).toBe(0);
    expect(result.saved_co2_grams).toBe(0);
    expect(result.savings_breakdown).toHaveLength(0);
  });

  it("detects model choice savings when using lighter models", () => {
    const entries = [
      createMockEntry({ model: "claude-haiku-3-5", input_tokens: 10000, output_tokens: 5000 }),
      createMockEntry({ model: "claude-haiku-3-5", input_tokens: 8000, output_tokens: 3000 }),
    ];

    const result = calculateSavings(entries);
    expect(result.actual_co2_grams).toBeGreaterThan(0);
    expect(result.worst_case_co2_grams).toBeGreaterThan(result.actual_co2_grams);
    expect(result.saved_co2_grams).toBeGreaterThan(0);
    expect(result.savings_breakdown.some((b) => b.category === "Smart model choices")).toBe(true);
  });

  it("shows no model savings when using Opus", () => {
    const entries = [
      createMockEntry({ model: "claude-opus-4-6", input_tokens: 10000, output_tokens: 5000 }),
    ];

    const result = calculateSavings(entries);
    expect(result.saved_co2_grams).toBe(0);
  });

  it("detects cache efficiency savings", () => {
    const entries = [
      createMockEntry({
        model: "claude-opus-4-6",
        input_tokens: 1000,
        output_tokens: 500,
        cache_read_tokens: 50000,
        cache_write_tokens: 1000,
      }),
    ];

    const result = calculateSavings(entries);
    expect(result.savings_breakdown.some((b) => b.category === "Cache efficiency")).toBe(true);
  });
});
