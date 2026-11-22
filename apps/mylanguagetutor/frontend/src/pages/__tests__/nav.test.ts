import { describe, it, expect } from "vitest";
import { buildNav } from "@/constants/nav";

describe("buildNav", () => {
  it("includes Support MyFreeApps once signed in", () => {
    const nav = buildNav({});
    expect(nav).toContainEqual(
      expect.objectContaining({ path: "/support-myfreeapps", label: "Support MyFreeApps" }),
    );
  });
});
