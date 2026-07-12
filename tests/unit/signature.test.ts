import { describe, expect, it } from "vitest";
import { buildSignatureHeader, verifySignature } from "../../src/core/signature.js";

describe("signature", () => {
  it("verifies a matching signature inside the replay window", () => {
    const timestamp = 1_783_948_210;
    const rawBody = JSON.stringify({ order_id: "1234" });
    const header = buildSignatureHeader("whsec_test", timestamp, rawBody);

    expect(
      verifySignature({
        secret: "whsec_test",
        timestamp,
        rawBody,
        signatureHeader: header,
        now: new Date(timestamp * 1000)
      })
    ).toBe(true);
  });

  it("rejects tampered payloads", () => {
    const timestamp = 1_783_948_210;
    const header = buildSignatureHeader("whsec_test", timestamp, "{\"ok\":true}");

    expect(
      verifySignature({
        secret: "whsec_test",
        timestamp,
        rawBody: "{\"ok\":false}",
        signatureHeader: header,
        now: new Date(timestamp * 1000)
      })
    ).toBe(false);
  });

  it("rejects stale timestamps", () => {
    const timestamp = 1_783_948_210;
    const rawBody = "{\"ok\":true}";
    const header = buildSignatureHeader("whsec_test", timestamp, rawBody);

    expect(
      verifySignature({
        secret: "whsec_test",
        timestamp,
        rawBody,
        signatureHeader: header,
        now: new Date((timestamp + 301) * 1000)
      })
    ).toBe(false);
  });
});
