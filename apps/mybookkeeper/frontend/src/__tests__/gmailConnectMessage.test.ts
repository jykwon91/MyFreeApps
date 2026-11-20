import { describe, expect, it } from "vitest";
import { gmailConnectMessageFor, readGmailConnectMessage } from "@/shared/utils/gmail-connect-message";

describe("gmailConnectMessageFor", () => {
  it("has nothing to say while it's still connecting", () => {
    expect(gmailConnectMessageFor({ kind: "connecting" })).toBeNull();
  });

  it("says connected, or why not", () => {
    expect(gmailConnectMessageFor({ kind: "connected" })).toEqual({ type: "gmail_connected" });
    expect(gmailConnectMessageFor({ kind: "failed", reason: "expired" })).toEqual({ type: "gmail_connect_failed", reason: "expired" });
  });
});

describe("readGmailConnectMessage", () => {
  it("reads the popup's messages", () => {
    expect(readGmailConnectMessage({ type: "gmail_connected" })).toEqual({ type: "gmail_connected" });
    expect(readGmailConnectMessage({ type: "gmail_connect_failed", reason: "wrong_account" })).toEqual({
      type: "gmail_connect_failed",
      reason: "wrong_account",
    });
  });

  it("reads a reason it doesn't know as failed", () => {
    expect(readGmailConnectMessage({ type: "gmail_connect_failed", reason: "<img>" })).toEqual({ type: "gmail_connect_failed", reason: "failed" });
  });

  it.each([[null], ["gmail_connected"], [{ type: "something_else" }]])("ignores anything else: %j", (data) => {
    expect(readGmailConnectMessage(data)).toBeNull();
  });
});
