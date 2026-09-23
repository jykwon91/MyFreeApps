import type { Game } from "@/types/game";

/**
 * Per-game feature registry.
 *
 * Lineup games (Valorant, CS2) all share the generic map/lineup pages under
 * `/:gameSlug`. A companion game has its own static pages instead, registered
 * here and routed by `src/games/<slug>/routes.tsx` (mounted in `src/routes.tsx`
 * BEFORE `/:gameSlug` so the slug isn't treated as a lineup game).
 *
 * To add a companion game: add an entry here, a `games/<slug>/` folder with its
 * routes, and a `kind: "companion"` row in the backend `games.json` fixture.
 */
export interface GameFeature {
  path: string;
  title: string;
  description: string;
}

export interface CompanionGameEntry {
  slug: string;
  landingPath: string;
  tagline: string;
  features: readonly GameFeature[];
}

export const WOW_FOREVER_SLUG = "wow-forever";

export const COMPANION_GAMES: Readonly<Record<string, CompanionGameEntry>> = {
  [WOW_FOREVER_SLUG]: {
    slug: WOW_FOREVER_SLUG,
    landingPath: "/wow-forever",
    tagline: "New player guide, world map & item compare",
    features: [
      {
        path: "/wow-forever/map",
        title: "World Map",
        description: "The nearest class trainer, flight master, inn or bank for your faction — with step-by-step directions.",
      },
      {
        path: "/wow-forever/guide",
        title: "New Player Guide",
        description: "Class picks, mistakes to avoid, where to level, professions, addons and dungeon basics.",
      },
      {
        path: "/wow-forever/compare",
        title: "Item Compare",
        description: "Paste or screenshot two or more items and see which is better for your class and spec.",
      },
    ],
  },
};

const LINEUP_TAGLINE = "Utility lineups by map";

export function getCompanionGame(slug: string): CompanionGameEntry | undefined {
  return COMPANION_GAMES[slug];
}

/** Where a game's card on the home grid links to. */
export function getGameLandingPath(game: Pick<Game, "slug" | "kind">): string {
  const companion = getCompanionGame(game.slug);
  if (game.kind === "companion" && companion) return companion.landingPath;
  return `/${game.slug}`;
}

export function getGameTagline(game: Pick<Game, "slug" | "kind">): string {
  if (game.kind === "companion") return getCompanionGame(game.slug)?.tagline ?? "";
  return LINEUP_TAGLINE;
}
