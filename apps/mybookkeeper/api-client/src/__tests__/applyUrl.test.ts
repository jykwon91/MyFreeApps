import { describe, expect, it } from "vitest";
import { buildApplyUrl } from "../utils/applyUrl";

describe("buildApplyUrl", () => {
  it("joins the base URL, the apply route and the slug", () => {
    expect(buildApplyUrl("https://example.org", "garden-room")).toBe("https://example.org/apply/garden-room");
  });

  it("does not double the slash when the base ends with one", () => {
    expect(buildApplyUrl("https://example.org/", "garden-room")).toBe("https://example.org/apply/garden-room");
  });
});
