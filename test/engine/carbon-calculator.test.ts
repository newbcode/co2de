import { describe, it, expect } from "vitest";
import {
  calculateCarbon,
  quickCO2,
  getEnergyPerToken,
  calculateMetaphors,
} from "../../src/engine/carbon-calculator.js";
import type { TokenUsage } from "../../src/core/types.js";

function makeUsage(overrides: Partial<TokenUsage> = {}): TokenUsage {
  return {
    input_tokens: 10_000,
    output_tokens: 5_000,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    model: "claude-opus-4-6",
    provider: "claude",
    timestamp: "2026-04-13T12:00:00Z",
    session_id: "test-session",
    ...overrides,
  };
}

describe("getEnergyPerToken", () => {
  it("returns correct coefficient for opus", () => {
    expect(getEnergyPerToken("claude-opus-4-6")).toBe(0.005);
  });

  it("returns correct coefficient for sonnet", () => {
    expect(getEnergyPerToken("claude-sonnet-4-6")).toBe(0.0025);
  });

  it("returns correct coefficient for haiku", () => {
    expect(getEnergyPerToken("claude-haiku-4-5")).toBe(0.001);
  });

  it("returns default for unknown model", () => {
    expect(getEnergyPerToken("unknown-model")).toBe(0.003);
  });
});

describe("calculateCarbon", () => {
  it("calculates CO2 for a basic opus session", () => {
    const usage = makeUsage({
      input_tokens: 10_000,
      output_tokens: 5_000,
    });

    const result = calculateCarbon(usage, "global");

    // 15,000 tokens × 0.005 Wh/tok × 1.2 PUE = 90 Wh
    // 90 Wh / 1000 × 475 gCO2/kWh = 42.75g
    expect(result.energy_wh).toBeCloseTo(90, 1);
    expect(result.co2_grams).toBeCloseTo(42.75, 1);
  });

  it("returns zero for zero tokens", () => {
    const usage = makeUsage({
      input_tokens: 0,
      output_tokens: 0,
    });

    const result = calculateCarbon(usage);
    expect(result.co2_grams).toBe(0);
    expect(result.energy_wh).toBe(0);
  });

  it("handles large token counts without overflow", () => {
    const usage = makeUsage({
      input_tokens: 1_000_000,
      output_tokens: 500_000,
    });

    const result = calculateCarbon(usage);
    expect(result.co2_grams).toBeGreaterThan(0);
    expect(Number.isFinite(result.co2_grams)).toBe(true);
  });

  it("includes cache tokens in calculation", () => {
    const withCache = makeUsage({
      input_tokens: 5_000,
      output_tokens: 5_000,
      cache_read_tokens: 3_000,
      cache_write_tokens: 2_000,
    });
    const withoutCache = makeUsage({
      input_tokens: 5_000,
      output_tokens: 5_000,
    });

    const resultWith = calculateCarbon(withCache);
    const resultWithout = calculateCarbon(withoutCache);

    expect(resultWith.co2_grams).toBeGreaterThan(resultWithout.co2_grams);
  });

  it("uses regional carbon intensity", () => {
    const usage = makeUsage();

    const global = calculateCarbon(usage, "global"); // 475
    const france = calculateCarbon(usage, "fr"); // 55
    const norway = calculateCarbon(usage, "no"); // 10

    expect(global.co2_grams).toBeGreaterThan(france.co2_grams);
    expect(france.co2_grams).toBeGreaterThan(norway.co2_grams);
  });

  it("falls back to global for unknown region", () => {
    const usage = makeUsage();
    const unknown = calculateCarbon(usage, "xx");
    const global = calculateCarbon(usage, "global");

    expect(unknown.co2_grams).toBe(global.co2_grams);
  });
});

describe("calculateMetaphors", () => {
  it("returns positive values for positive CO2", () => {
    const m = calculateMetaphors(10);

    expect(m.tree_absorption_seconds).toBeGreaterThan(0);
    expect(m.car_drive_meters).toBeGreaterThan(0);
    expect(m.phone_charges).toBeGreaterThan(0);
    expect(m.google_searches).toBeGreaterThan(0);
    expect(m.netflix_streaming_seconds).toBeGreaterThan(0);
    expect(m.led_bulb_hours).toBeGreaterThan(0);
  });

  it("returns zero for zero CO2", () => {
    const m = calculateMetaphors(0);
    expect(m.car_drive_meters).toBe(0);
    expect(m.google_searches).toBe(0);
  });

  it("metaphor inverse matches original CO2", () => {
    const co2 = 5.0;
    const m = calculateMetaphors(co2);

    // car_drive_meters back to CO2: meters / 1000 * 120 g/km
    const backFromCar = (m.car_drive_meters / 1000) * 120;
    expect(backFromCar).toBeCloseTo(co2, 5);
  });
});

describe("quickCO2", () => {
  it("matches calculateCarbon for simple case", () => {
    const usage = makeUsage({
      input_tokens: 10_000,
      output_tokens: 5_000,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
    });

    const full = calculateCarbon(usage, "global");
    const quick = quickCO2(10_000, 5_000, "claude-opus-4-6", "global");

    expect(quick).toBeCloseTo(full.co2_grams, 5);
  });
});

