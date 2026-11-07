import type { WhatsNewEntry } from "@/games/wow-forever/types/whatsNew/whatsNewEntry";

/**
 * The hub's "What's new on this site" list — hand-written, NEWEST FIRST
 * (a test checks the order). Date = the day the change merged to main.
 *
 * `to` decides which page's update dot the entry lights: its path must be the
 * hub (`/wow-forever`) or a hub tile's path from `games/registry.ts` (a test
 * checks; item pages and triage carry no dot). An entry is remembered as seen by
 * its date + title, so retitling one shows its dot again. Write for players:
 * what they can do now, in one sentence.
 */
export const WHATS_NEW: readonly WhatsNewEntry[] = [
  {
    date: "2026-11-07",
    title: "Zoom and drag the World Map",
    summary:
      "Zoom into any map with the scroll wheel, a pinch or the + and − buttons, and drag it around to look closer at towns, roads and markers.",
    to: "/wow-forever/map",
  },
  {
    date: "2026-11-07",
    title: "Source tags on every page",
    summary:
      "One set of tags shows where each fact comes from: seen in game, official, game files, Classic data or unconfirmed. Hover or tap a tag to see what it means.",
    to: "/wow-forever/professions",
  },
  {
    date: "2026-11-07",
    title: "Item tooltips",
    summary: "Hover over an item name, or tab to it, to see its in-game tooltip.",
    to: "/wow-forever/gear",
  },
  {
    date: "2026-11-07",
    title: "My lists",
    summary: "Build your own gear lists on Best gear, tick off what you have and share a list with a link.",
    to: "/wow-forever/gear?view=mine",
  },
  {
    date: "2026-11-07",
    title: "Item pages",
    summary:
      "Every item has its own page: its stats and how to get it, from vendors and quests to drops, each with its source tag. Best gear links to them.",
    to: "/wow-forever/gear",
  },
  {
    date: "2026-11-07",
    title: "Game icons in Professions",
    summary: "Recipes, materials and spells in the profession guides now show their in-game icons.",
    to: "/wow-forever/professions",
  },
  {
    date: "2026-11-07",
    title: "Items added since launch",
    summary: "Items Blizzard added or changed by hotfix now show up in item search, Item Compare and Best gear.",
    to: "/wow-forever/compare",
  },
  {
    date: "2026-11-07",
    title: "Collapsible side menu",
    summary: "Shrink the left menu to icons to give the page more room.",
    to: "/wow-forever",
  },
  {
    date: "2026-11-07",
    title: "One Macros page",
    summary: "Mouseover and other macros for every class on one page, with hover-cast macros first.",
    to: "/wow-forever/macros",
  },
];
