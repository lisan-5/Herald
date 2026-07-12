import { lookup } from "node:dns/promises";
import { isPrivateOrReservedIp } from "../core/ssrf.js";

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

export async function assertPublicWebhookUrl(url: string) {
  const parsed = new URL(url);

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new SsrfBlockedError("Webhook URL must use http or https");
  }

  const addresses = await lookup(parsed.hostname, { all: true, verbatim: true });

  if (addresses.length === 0) {
    throw new SsrfBlockedError("Webhook URL hostname did not resolve");
  }

  const blockedAddress = addresses.find((address) => isPrivateOrReservedIp(address.address));

  if (blockedAddress) {
    throw new SsrfBlockedError("Webhook URL resolves to a private or reserved address");
  }
}

export function isSsrfBlockedError(error: unknown): error is SsrfBlockedError {
  return error instanceof SsrfBlockedError;
}
