import { describe, expect, it } from "vitest";
import { retryDelayMs } from "../../src/core/backoff.js";

describe("retryDelayMs", () => {
  it("uses the documented exponential schedule with deterministic jitter", () => {
    expect(retryDelayMs(2, () => 0.5)).toBe(30_000);
    expect(retryDelayMs(3, () => 0.5)).toBe(120_000);
    expect(retryDelayMs(4, () => 0.5)).toBe(480_000);
  });

  it("keeps jitter within plus or minus 20 percent", () => {
    expect(retryDelayMs(2, () => 0)).toBe(24_000);
    expect(retryDelayMs(2, () => 1)).toBe(36_000);
  });

  it("caps the base delay at 12 hours before jitter", () => {
    expect(retryDelayMs(10, () => 0.5)).toBe(43_200_000);
  });
});
