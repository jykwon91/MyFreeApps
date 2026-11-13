import { describe, expect, it } from "vitest";
import { versionBadgeLabel } from "../utils/versionBadgeLabel";

describe("versionBadgeLabel", () => {
  it("says Draft before the first version", () => {
    expect(versionBadgeLabel(null)).toBe("Draft");
  });

  it("prefixes the version number with v", () => {
    expect(versionBadgeLabel(3)).toBe("v3");
  });
});
