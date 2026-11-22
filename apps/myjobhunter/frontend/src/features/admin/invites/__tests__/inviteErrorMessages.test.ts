import { describe, it, expect } from "vitest";
import { extractInviteCreateErrorMessage, isInviteEmailUnconfirmed } from "../inviteErrorMessages";

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

  it("explains that no invite was created when the email could not be sent", () => {
    const msg = extractInviteCreateErrorMessage(makeRtkError("invite_email_failed"));
    expect(msg).toContain("no invite was created");
    expect(msg).toContain("Try again");
  });

  it("says the email may have arrived and points to cancel-and-resend when delivery is unconfirmed", () => {
    const msg = extractInviteCreateErrorMessage(makeRtkError("invite_email_unconfirmed"));
    expect(msg).toContain("may have arrived");
    expect(msg).toContain("cancel it and send again");
    expect(msg).not.toContain("no invite was created");
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

  it("flags only the unconfirmed-delivery code", () => {
    expect(isInviteEmailUnconfirmed(makeRtkError("invite_email_unconfirmed"))).toBe(true);
    expect(isInviteEmailUnconfirmed(makeRtkError("invite_email_failed"))).toBe(false);
    expect(isInviteEmailUnconfirmed(null)).toBe(false);
  });
});
