import { describe, it, expect } from "vitest";
import { extractInviteCreateErrorMessage } from "../inviteErrorMessages";

function makeRtkError(detail: string): unknown {
  return { data: { detail } };
}

describe("extractInviteCreateErrorMessage", () => {
  it("returns user-already-exists hint for user_already_exists code", () => {
    const msg = extractInviteCreateErrorMessage(makeRtkError("user_already_exists"));
    expect(msg).toContain("User already exists");
    expect(msg).toContain("log in directly");
  });

  it("returns invite-already-pending hint for invite_already_pending code", () => {
    const msg = extractInviteCreateErrorMessage(makeRtkError("invite_already_pending"));
    expect(msg).toContain("Invite already pending");
    expect(msg).toContain("cancel");
  });

  it("returns fallback for an unrecognised detail code", () => {
    const msg = extractInviteCreateErrorMessage(makeRtkError("some_unknown_code"));
    expect(msg).toMatch(/couldn't send invite/i);
  });

  it("returns fallback when error has no data field", () => {
    const msg = extractInviteCreateErrorMessage(new Error("network error"));
    expect(msg).toMatch(/couldn't send invite/i);
  });

  it("returns fallback when error is null", () => {
    const msg = extractInviteCreateErrorMessage(null);
    expect(msg).toMatch(/couldn't send invite/i);
  });

  it("user_already_exists and invite_already_pending produce distinct messages", () => {
    const a = extractInviteCreateErrorMessage(makeRtkError("user_already_exists"));
    const b = extractInviteCreateErrorMessage(makeRtkError("invite_already_pending"));
    expect(a).not.toEqual(b);
  });
});
