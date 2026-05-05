import { describe, it, expect } from "vitest";
import { useInquiryReplyMode } from "@/app/features/inquiries/useInquiryReplyMode";

describe("useInquiryReplyMode", () => {
  it("returns 'reconnect' when reconnectReason is missing-integration", () => {
    expect(
      useInquiryReplyMode({ reconnectReason: "missing-integration", tab: "template" }),
    ).toBe("reconnect");
  });

  it("returns 'reconnect' when reconnectReason is missing-send-scope", () => {
    expect(
      useInquiryReplyMode({ reconnectReason: "missing-send-scope", tab: "custom" }),
    ).toBe("reconnect");
  });

  it("returns 'reconnect' when reconnectReason is reauth-required", () => {
    expect(
      useInquiryReplyMode({ reconnectReason: "reauth-required", tab: "template" }),
    ).toBe("reconnect");
  });

  it("returns 'template' when gmail is healthy and template tab active", () => {
    expect(
      useInquiryReplyMode({ reconnectReason: null, tab: "template" }),
    ).toBe("template");
  });

  it("returns 'custom' when gmail is healthy and custom tab active", () => {
    expect(
      useInquiryReplyMode({ reconnectReason: null, tab: "custom" }),
    ).toBe("custom");
  });

  it("returns 'template' while integrations still loading (reconnectReason is null)", () => {
    // While loading, reconnectReason is null, so we render the normal tab view.
    expect(
      useInquiryReplyMode({ reconnectReason: null, tab: "template" }),
    ).toBe("template");
  });
});
