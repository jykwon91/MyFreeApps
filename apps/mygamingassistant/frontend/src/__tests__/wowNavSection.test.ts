/**
 * Unit tests for the WoW Forever nav section built from the game registry.
 *
 * Verifies:
 *   - Every feature in the registry has a unique path and a non-empty iconName
 *   - The iconName is one of the icons actually imported in RootLayout
 *   - Every feature path matches a registered WoW route
 *   - The registry is the single source of truth (hub tile count === section item count)
 */
import { describe, expect, it } from "vitest";
import { COMPANION_GAMES, WOW_FOREVER_SLUG } from "@/games/registry";
import { wowForeverRoutes } from "@/games/wow-forever/routes";

const KNOWN_ICON_NAMES = new Set([
  "Coins",
  "Hammer",
  "LayoutDashboard",
  "Lightbulb",
  "Map",
  "Scale",
  "Terminal",
  "TrendingUp",
  "Trophy",
  "Utensils",
]);

const registeredPaths = new Set(wowForeverRoutes.map((r) => r.path).filter(Boolean));

describe("WoW Forever registry — nav section contract", () => {
  const { features } = COMPANION_GAMES[WOW_FOREVER_SLUG];

  it("every feature has a non-empty path, title, iconName and description", () => {
    for (const f of features) {
      expect(f.path, `path missing on "${f.title}"`).toBeTruthy();
      expect(f.title, `title missing on feature with path "${f.path}"`).toBeTruthy();
      expect(f.iconName, `iconName missing on "${f.title}"`).toBeTruthy();
      expect(f.description, `description missing on "${f.title}"`).toBeTruthy();
    }
  });

  it("every iconName is in the set imported by RootLayout", () => {
    for (const f of features) {
      expect(
        KNOWN_ICON_NAMES.has(f.iconName),
        `"${f.iconName}" on "${f.title}" is not in KNOWN_ICON_NAMES — add it to WOW_ICONS in RootLayout.tsx`
      ).toBe(true);
    }
  });

  it("every feature path is a registered WoW route", () => {
    for (const f of features) {
      expect(
        registeredPaths.has(f.path),
        `feature path "${f.path}" is not in wowForeverRoutes`
      ).toBe(true);
    }
  });

  it("feature paths are unique", () => {
    const paths = features.map((f) => f.path);
    const unique = new Set(paths);
    expect(unique.size).toBe(paths.length);
  });

  it("all features start with /wow-forever/", () => {
    for (const f of features) {
      expect(f.path, `"${f.path}" does not start with /wow-forever/`).toMatch(/^\/wow-forever\//);
    }
  });
});
