import { describe, expect, it } from "vitest";
import { isPrivateOrReservedIp } from "../../src/core/ssrf.js";

describe("isPrivateOrReservedIp", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.8",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.1.1",
    "::1",
    "fc00::1",
    "fd00::1",
    "fe80::1"
  ])("blocks %s", (address) => {
    expect(isPrivateOrReservedIp(address)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])("allows %s", (address) => {
    expect(isPrivateOrReservedIp(address)).toBe(false);
  });
});
