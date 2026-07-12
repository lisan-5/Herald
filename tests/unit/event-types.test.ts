import { describe, expect, it } from "vitest";
import { matchesEventType } from "../../src/core/event-types.js";

describe("matchesEventType", () => {
  it("matches exact event names", () => {
    expect(matchesEventType("order.paid", "order.paid")).toBe(true);
    expect(matchesEventType("order.paid", "order.refunded")).toBe(false);
  });

  it("matches wildcard subscriptions", () => {
    expect(matchesEventType("order.*", "order.paid")).toBe(true);
    expect(matchesEventType("*.created", "user.created")).toBe(true);
    expect(matchesEventType("invoice.*", "order.paid")).toBe(false);
  });
});
