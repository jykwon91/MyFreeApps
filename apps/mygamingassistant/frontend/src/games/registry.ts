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
  /**
   * Lucide icon name used in the sidebar nav and anywhere icon-driven UI renders
   * this feature (e.g. a collapsed icon-rail). Injected as a ReactNode at the
   * component layer — keep this file free of JSX / React imports.
   */
  iconName: string;
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
    tagline: "World map, profession leveling & item compare",
    features: [
      {
        path: "/wow-forever/map",
        title: "World Map",
        iconName: "Map",
        description: "The nearest class trainer, flight master, inn or bank for your faction — with step-by-step directions.",
      },
      {
        path: "/wow-forever/dungeons",
        title: "Dungeons",
        iconName: "Castle",
        description: "Every dungeon's level, where its door is, its bosses in order and what each one drops.",
      },
      {
        path: "/wow-forever/professions",
        title: "Professions",
        iconName: "Hammer",
        description: "Cooking, Fishing, Tailoring and Enchanting: where to train, the fastest route to 300 and a shopping list.",
      },
      {
        path: "/wow-forever/food",
        title: "What should I eat?",
        iconName: "Utensils",
        description: "The best food to cook for your level, class and what you're doing — leveling, dungeons, raids, PvP or fishing.",
      },
      {
        path: "/wow-forever/gold",
        title: "Making gold",
        iconName: "Coins",
        description: "How to make gold at your level and with your class — what to gather, what to sell, and what not to do.",
      },
      {
        path: "/wow-forever/auction-house",
        title: "Auction house prices",
        iconName: "TrendingUp",
        description: "Look up what any item sells for: market value, average sale price and how many sell a day, in the US or Europe.",
      },
      {
        path: "/wow-forever/macros",
        title: "Macros",
        iconName: "Terminal",
        description: "Hover-cast (mouseover) and other macros to paste into the game, for every class, with names checked against the client.",
      },
      {
        path: "/wow-forever/talents",
        title: "Talents",
        iconName: "Sparkles",
        description: "Plan a talent build for any class and level, see what Forever changed from Classic, and share it as a link.",
      },
      {
        path: "/wow-forever/gear",
        title: "Best gear",
        iconName: "Trophy",
        description: "The top three items per slot for your class, spec and level — your next upgrades while leveling, then a pre-raid list for 60.",
      },
      {
        path: "/wow-forever/compare",
        title: "Item Compare",
        iconName: "Scale",
        description: "Paste or screenshot two or more items and see which is better for your class and spec.",
      },
      {
        path: "/wow-forever/suggest",
        title: "Suggest a feature",
        iconName: "Lightbulb",
        description: "Tell me what's missing, and see what other players asked for — add a \"Me too\" to the ones you want.",
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
