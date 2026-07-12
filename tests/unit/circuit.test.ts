import { describe, expect, it } from "vitest";
import {
  CIRCUIT_BREAKER_THRESHOLD,
  recordDeliveryFailure,
  recordDeliverySuccess
} from "../../src/core/circuit.js";

describe("circuit breaker", () => {
  it("opens after the configured number of consecutive failures", () => {
    let state = { status: "active" as const, consecutiveFailures: 0 };

    for (let i = 0; i < CIRCUIT_BREAKER_THRESHOLD; i += 1) {
      state = recordDeliveryFailure(state);
    }

    expect(state).toEqual({
      status: "disabled_by_breaker",
      consecutiveFailures: CIRCUIT_BREAKER_THRESHOLD
    });
  });

  it("closes and resets failures after a success", () => {
    expect(
      recordDeliverySuccess({ status: "disabled_by_breaker", consecutiveFailures: 20 })
    ).toEqual({
      status: "active",
      consecutiveFailures: 0
    });
  });
});
