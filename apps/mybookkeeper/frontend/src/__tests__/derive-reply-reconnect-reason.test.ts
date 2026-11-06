import { describe, expect, it } from "vitest";
import { deriveReplyReconnectReason } from "@/app/features/inquiries/derive-reply-reconnect-reason";

describe("deriveReplyReconnectReason", () => {
  it.each([
    [true, undefined, null],
    [false, undefined, "missing-integration"],
    [false, { needs_reauth: true, has_send_scope: true }, "reauth-required"],
    [false, { has_send_scope: false }, "missing-send-scope"],
    [false, { has_send_scope: true }, null],
  ] as const)("loading=%s gmail=%j is %s", (loading, gmail, expected) => {
    expect(deriveReplyReconnectReason(loading, gmail)).toBe(expected);
  });
});
