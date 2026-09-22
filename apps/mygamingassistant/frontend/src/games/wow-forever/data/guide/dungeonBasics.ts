import type { DungeonTopic } from "@/games/wow-forever/data/guide/guideTypes";

export const DUNGEON_BASICS: readonly DungeonTopic[] = [
  {
    title: "Roles",
    points: [
      "A group is five players: one tank, one healer and three damage dealers.",
      "The tank starts every fight and keeps enemies focused on them.",
      "The healer keeps everyone alive — mostly the tank.",
      "Damage dealers kill enemies, starting with the one the tank marks.",
    ],
  },
  {
    title: "Threat",
    points: [
      "Enemies attack whoever has the most threat. Damage and healing both build it.",
      "Let the tank hit first, and don't open with your biggest attack.",
      "If an enemy turns to you, stop attacking for a moment and let the tank take it back.",
      "Use your threat-drop or crowd-control abilities when asked, not on your own.",
    ],
  },
  {
    title: "Loot",
    points: [
      "Roll Need only on items that are an upgrade for your main spec.",
      "Roll Greed on items you'd sell or disenchant.",
      "Agree on loot rules before the first boss, especially for items everyone wants.",
      "Ninja-looting (Needing on things you can't use) gets you a bad reputation fast.",
    ],
  },
];
