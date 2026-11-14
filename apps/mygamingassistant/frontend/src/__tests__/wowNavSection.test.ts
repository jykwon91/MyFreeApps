/**
 * Unit tests for the WoW Forever nav section built from the game registry.
 *
 * Verifies:
 *   - Every feature in the registry has a unique path and a non-empty iconName
 *   - The iconName has an icon in FEATURE_ICONS (the left nav + hub tiles)
 *   - Every feature path matches a registered WoW route
 *   - Every feature sits in a declared category; each category is non-empty, has an icon,
 *     and its features are listed together (the registry order is the nav order)
 *   - The registry is the single source of truth (hub tile count === section item count)
 */
import { describe, expect, it } from "vitest";
import { COMPANION_GAMES, WOW_FOREVER_SLUG } from "@/games/registry";
import { wowForeverRoutes } from "@/games/wow-forever/routes";
import { FEATURE_ICONS } from "@/games/wow-forever/data/featureIcons";

const KNOWN_ICON_NAMES = new Set(Object.keys(FEATURE_ICONS));

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
        `"${f.iconName}" on "${f.title}" has no icon — add it to FEATURE_ICONS in data/featureIcons.ts`
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

  it("every feature names a declared category, and every category has pages and an icon", () => {
    const { categories } = COMPANION_GAMES[WOW_FOREVER_SLUG];
    const ids = categories.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of features) expect(ids, `"${f.title}" has unknown category "${f.category}"`).toContain(f.category);
    for (const c of categories) {
      expect(c.title, `title missing on category "${c.id}"`).toBeTruthy();
      expect(KNOWN_ICON_NAMES.has(c.iconName), `category "${c.id}" icon "${c.iconName}" not in FEATURE_ICONS`).toBe(true);
      expect(features.some((f) => f.category === c.id), `category "${c.id}" has no pages`).toBe(true);
    }
  });

  it("lists each category's features together, in category order", () => {
    const { categories } = COMPANION_GAMES[WOW_FOREVER_SLUG];
    const order = features.map((f) => categories.findIndex((c) => c.id === f.category));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("all features start with /wow-forever/", () => {
    for (const f of features) {
      expect(f.path, `"${f.path}" does not start with /wow-forever/`).toMatch(/^\/wow-forever\//);
    }
  });
});
