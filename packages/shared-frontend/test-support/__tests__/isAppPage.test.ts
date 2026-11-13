import { describe, expect, it } from "vitest";
import { isAppPage } from "../isAppPage";

const BASE = "http://localhost:5173";

describe("isAppPage", () => {
  it("is true for a page on the baseURL origin", () => {
    expect(isAppPage("http://localhost:5173/login?next=%2F", BASE)).toBe(true);
  });

  it("is false for about:blank and data: URLs", () => {
    expect(isAppPage("about:blank", BASE)).toBe(false);
    expect(isAppPage("data:text/html,<p>x</p>", BASE)).toBe(false);
  });

  it("is false for another origin", () => {
    expect(isAppPage("http://localhost:5174/", BASE)).toBe(false);
    expect(isAppPage("https://discord.com/activities", BASE)).toBe(false);
  });

  it("is true for any http(s) page when the suite has no baseURL", () => {
    expect(isAppPage("http://localhost:5173/", undefined)).toBe(true);
    expect(isAppPage("about:blank", undefined)).toBe(false);
  });

  it("is false for a URL it can't parse", () => {
    expect(isAppPage("", BASE)).toBe(false);
  });
});
