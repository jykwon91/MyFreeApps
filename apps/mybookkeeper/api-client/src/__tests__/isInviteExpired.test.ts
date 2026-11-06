import { describe, expect, it } from "vitest";
import { isInviteExpired } from "../utils/isInviteExpired";

const now = new Date("2026-11-06T12:00:00Z");

describe("isInviteExpired", () => {
  it("is false before the expiry time", () => {
    expect(isInviteExpired({ expires_at: "2026-11-06T12:00:01Z" }, now)).toBe(false);
  });

  it("is true at and after the expiry time", () => {
    expect(isInviteExpired({ expires_at: "2026-11-06T12:00:00Z" }, now)).toBe(true);
    expect(isInviteExpired({ expires_at: "2026-11-01T00:00:00Z" }, now)).toBe(true);
  });
});
