import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_VERSION = "v1";
const SIGNATURE_TOLERANCE_SECONDS = 300;

export function signPayload(secret: string, timestamp: number, rawBody: string | Buffer): string {
  const signedPayload = `${timestamp}.${rawBody.toString("utf8")}`;
  return createHmac("sha256", secret).update(signedPayload).digest("hex");
}

export function buildSignatureHeader(secret: string, timestamp: number, rawBody: string | Buffer) {
  return `${SIGNATURE_VERSION}=${signPayload(secret, timestamp, rawBody)}`;
}

export function verifySignature(params: {
  secret: string;
  timestamp: number;
  rawBody: string | Buffer;
  signatureHeader: string;
  now?: Date;
  toleranceSeconds?: number;
}): boolean {
  const toleranceSeconds = params.toleranceSeconds ?? SIGNATURE_TOLERANCE_SECONDS;
  const nowSeconds = Math.floor((params.now ?? new Date()).getTime() / 1000);

  if (Math.abs(nowSeconds - params.timestamp) > toleranceSeconds) {
    return false;
  }

  const expected = signPayload(params.secret, params.timestamp, params.rawBody);
  const provided = parseSignatureHeader(params.signatureHeader).get(SIGNATURE_VERSION);

  if (!provided) {
    return false;
  }

  return constantTimeEqualHex(expected, provided);
}

function parseSignatureHeader(header: string): Map<string, string> {
  const pairs = new Map<string, string>();

  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key && value) {
      pairs.set(key.trim(), value.trim());
    }
  }

  return pairs;
}

function constantTimeEqualHex(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected, "hex");
  const providedBuffer = Buffer.from(provided, "hex");

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}
