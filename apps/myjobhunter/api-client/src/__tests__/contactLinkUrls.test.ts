import { describe, expect, it } from "vitest";
import { contactEmailUrl, contactProfileUrl } from "../utils/contactLinkUrls";

describe("contactEmailUrl", () => {
  it("links a plain address", () => {
    expect(contactEmailUrl(" ada@example.com ")).toBe("mailto:ada@example.com");
  });

  it("won't link anything that isn't one plain address", () => {
    expect(contactEmailUrl("javascript:alert(1)")).toBeNull();
    expect(contactEmailUrl("ada@example.com?bcc=eve@example.com")).toBeNull();
    expect(contactEmailUrl("ada@example.com,eve@example.com")).toBeNull();
    expect(contactEmailUrl("ask Ada")).toBeNull();
  });
});

describe("contactProfileUrl", () => {
  it("links http and https only", () => {
    expect(contactProfileUrl("https://www.linkedin.com/in/ada")).toBe("https://www.linkedin.com/in/ada");
    expect(contactProfileUrl("javascript:alert(1)")).toBeNull();
    expect(contactProfileUrl("linkedin.com/in/ada")).toBeNull();
  });
});
