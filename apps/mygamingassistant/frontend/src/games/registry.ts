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
        path: "/wow-forever/ask",
        title: "Ask",
        iconName: "MessageCircle",
        description: "Ask where something is — the nearest trainer, a town, an item or a dungeon — and get it on a map with a route there.",
      },
      {
        path: "/wow-forever/quests",
        title: "Quests",
        iconName: "ScrollText",
        description: "Every quest the Forever client knows: search by name, filter by zone, faction or level, and see who gives it, what to do and what you get.",
      },
      {
        path: "/wow-forever/dungeons",
        title: "Dungeons",
        iconName: "Castle",
        description: "Every dungeon's level, where its door is, its bosses in order and what each one drops.",
      },
      {
        path: "/wow-forever/hunter-pets",
        title: "Hunter pets",
        iconName: "PawPrint",
        description: "Pet families and their modifiers, every pet ability rank and which beasts teach it, and the beasts you can tame.",
      },
      {
        path: "/wow-forever/rares",
        title: "Rares",
        iconName: "Crosshair",
        description: "Rare and rare elite creatures: where they spawn, what they drop, a /target macro and a list to tick off.",
      },
      {
        path: "/wow-forever/library",
        title: "Library books",
        iconName: "Library",
        description: "Every collectible library book in the game files, the reward for turning them in and a list of the ones you've found.",
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
        path: "/wow-forever/classes",
        title: "Classes",
        iconName: "GraduationCap",
        description: "Every class's icon, roles, races, proficiencies, spellbook, talents and what Forever changed — all in one place.",
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
        path: "/wow-forever/races",
        title: "Races",
        iconName: "Users",
        description: "Every race's faction, starting zone, classes and racial traits, and what Forever changed from Classic.",
      },
      {
        path: "/wow-forever/spellbook",
        title: "Spellbook",
        iconName: "BookOpen",
        description: "Every spell each class can train in Forever: ranks, learn levels, trainer costs, tooltips and what changed from Classic.",
      },
      {
        path: "/wow-forever/downrank",
        title: "Downrank calculator",
        iconName: "Gauge",
        description: "See which rank of a heal or damage spell gives the most per mana and per second at your level and gear, with the macro to cast it.",
      },
      {
        path: "/wow-forever/changes",
        title: "Changes vs Classic",
        iconName: "GitCompare",
        description: "Every talent, class spell, item, quest and zone Forever changed or added, old and new side by side, from the game files.",
      },
      {
        path: "/wow-forever/items",
        title: "Items",
        iconName: "Backpack",
        description: "Search the gear the Forever game files have shown so far by name, quality, slot, type and level, and see what Forever changed or added.",
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
        path: "/wow-forever/server-status",
        title: "Server status",
        iconName: "Activity",
        description: "Is the realm up? See the last day or week of uptime, recent outages, and what to do about common login errors.",
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
