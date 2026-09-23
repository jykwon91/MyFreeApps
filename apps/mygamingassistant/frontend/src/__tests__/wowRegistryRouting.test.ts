import { describe, expect, it } from "vitest";
import { matchRoutes, type RouteObject } from "react-router-dom";
import { getGameLandingPath, getGameTagline } from "@/games/registry";
import { wowForeverRoutes } from "@/games/wow-forever/routes";
import { routes } from "@/routes";

function shellChildren(): RouteObject[] {
  const shell = routes.find((r) => r.children !== undefined);
  return shell?.children ?? [];
}

function matchedPath(pathname: string): string | undefined {
  const matches = matchRoutes(routes, pathname) ?? [];
  return matches[matches.length - 1]?.route.path;
}

describe("game registry", () => {
  it("links lineup games to their map grid and WoW Forever to its own landing", () => {
    expect(getGameLandingPath({ slug: "cs2", kind: "lineups" })).toBe("/cs2");
    expect(getGameLandingPath({ slug: "valorant", kind: "lineups" })).toBe("/valorant");
    expect(getGameLandingPath({ slug: "wow-forever", kind: "companion" })).toBe("/wow-forever");
  });

  it("falls back to the slug path for an unregistered companion game", () => {
    expect(getGameLandingPath({ slug: "unknown", kind: "companion" })).toBe("/unknown");
  });

  it("gives each card a tagline", () => {
    expect(getGameTagline({ slug: "cs2", kind: "lineups" })).toMatch(/lineups/i);
    expect(getGameTagline({ slug: "wow-forever", kind: "companion" })).toMatch(/guide/i);
  });
});

describe("routing", () => {
  it("registers the WoW routes before /:gameSlug", () => {
    const paths = shellChildren().map((r) => r.path);
    const gameSlugIndex = paths.indexOf("/:gameSlug");
    expect(gameSlugIndex).toBeGreaterThan(-1);
    for (const r of wowForeverRoutes) {
      const i = paths.indexOf(r.path);
      expect(i).toBeGreaterThan(-1);
      expect(i).toBeLessThan(gameSlugIndex);
    }
  });

  it("resolves WoW paths to the WoW pages and lineup games to the map grid", () => {
    expect(matchedPath("/wow-forever")).toBe("/wow-forever");
    expect(matchedPath("/wow-forever/guide")).toBe("/wow-forever/guide");
    expect(matchedPath("/wow-forever/compare")).toBe("/wow-forever/compare");
    expect(matchedPath("/wow-forever/map")).toBe("/wow-forever/map");
    expect(matchedPath("/cs2")).toBe("/:gameSlug");
    expect(matchedPath("/valorant/ascent")).toBe("/:gameSlug/:mapSlug");
  });
});
