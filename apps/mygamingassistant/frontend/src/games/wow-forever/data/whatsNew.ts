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
    title: "Server status history and login help",
    summary:
      "See how the realms have been over the last day or week, every recent outage with how long it lasted, and what to try for common login errors like WOW51900319.",
    to: "/wow-forever/server-status",
  },
  {
    date: "2026-11-07",
    title: "Changes vs Classic",
    summary:
      "See every talent, class spell, item, quest and zone Forever changed or added, with the Classic and Forever values side by side, filtered by category, class or a search.",
    to: "/wow-forever/changes",
  },
  {
    date: "2026-11-07",
    title: "Talent calculator",
    summary:
      "Plan a talent build for any class and level with Forever's own talent text, see where a talent changed from Classic, and share the build as a link.",
    to: "/wow-forever/talents",
  },
  {
    date: "2026-11-07",
    title: "Dungeon quests",
    summary:
      "Each dungeon page now lists its quests for your faction: who gives them (with a link to them on the World Map), the quests that lead up to them, what to do inside and what you get.",
    to: "/wow-forever/dungeons",
  },
  {
    date: "2026-11-07",
    title: "Gnomeregan and Blackfathom boss lists",
    summary:
      "Gnomeregan's page now lists all five bosses with their drops, and Blackfathom Deeps shows its last three bosses too, Aku'mai included, each with a walking route inside.",
    to: "/wow-forever/dungeons",
  },
  {
    date: "2026-11-07",
    title: "Dungeon pages",
    summary:
      "Open any dungeon to see when you can go (level, group size, keys), where it is (nearest flight path, walking directions, each wing's bosses), its bosses in order and what each boss drops, with drop chances.",
    to: "/wow-forever/dungeons",
  },
  {
    date: "2026-11-07",
    title: "Satellite view on the World Map",
    summary:
      "Switch a zone or city on the World Map to Satellite to see the real ground from above, the way your minimap shows it, with every marker and route still in place.",
    to: "/wow-forever/map",
  },
  {
    date: "2026-11-07",
    title: "Your own marks, routes and shareable maps",
    summary:
      "Right-click the World Map (or press and hold on a phone) to drop your own marks, join them into a route with the distance in yards, and share a link that opens the same map, marks and route for a friend.",
    to: "/wow-forever/map",
  },
  {
    date: "2026-11-07",
    title: "Map layers and where to level",
    summary:
      "Pick what the World Map shows — flight masters, inns, trainers, quest givers, herbs, ore and more, each with how many are on the map — and see every zone's levels, coloured by how well it suits your level.",
    to: "/wow-forever/map",
  },
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
