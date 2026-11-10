import { describe, expect, it } from "vitest";
import { safeLinkUrl } from "../utils/safeLinkUrl";

const WEB = ["http", "https"] as const;

describe("safeLinkUrl", () => {
  it("keeps a link with an allowed scheme, in any case, trimmed", () => {
    expect(safeLinkUrl("https://www.linkedin.com/in/ada", WEB)).toBe("https://www.linkedin.com/in/ada");
    expect(safeLinkUrl("  HTTP://example.com ", WEB)).toBe("HTTP://example.com");
  });

  it("refuses every other scheme", () => {
    expect(safeLinkUrl("javascript:alert(1)", WEB)).toBeNull();
    expect(safeLinkUrl("data:text/html,hi", WEB)).toBeNull();
    expect(safeLinkUrl("file:///etc/passwd", WEB)).toBeNull();
    expect(safeLinkUrl("myjobhunter://settings", WEB)).toBeNull();
    expect(safeLinkUrl("mailto:ada@example.com", WEB)).toBeNull();
  });

  it("refuses a value with no scheme", () => {
    expect(safeLinkUrl("linkedin.com/in/ada", WEB)).toBeNull();
    expect(safeLinkUrl("", WEB)).toBeNull();
  });
});
