import { describe, expect, it } from "vitest";
import { buildSiteUrl } from "../discord-activity/buildSiteUrl";

const SITE = "https://games.example.org";

describe("buildSiteUrl", () => {
  it("maps an in-app location onto the real site", () => {
    expect(buildSiteUrl(SITE, { pathname: "/cs2/maps/mirage", search: "?utility=smoke", hash: "#a-site" })).toBe(
      "https://games.example.org/cs2/maps/mirage?utility=smoke#a-site",
    );
  });

  it("defaults to no query and no hash", () => {
    expect(buildSiteUrl(SITE, { pathname: "/packages" })).toBe("https://games.example.org/packages");
  });

  it("drops Discord's launch parameters so the site doesn't think it is inside Discord", () => {
    expect(
      buildSiteUrl(SITE, { pathname: "/", search: "?frame_id=f-1&instance_id=i-1&platform=desktop&tab=maps" }),
    ).toBe("https://games.example.org/?tab=maps");
  });

  it("can't be pointed at another host", () => {
    const url = new URL(buildSiteUrl(SITE, { pathname: "//evil.example/phish" }));
    expect(url.host).toBe("games.example.org");
  });
});
