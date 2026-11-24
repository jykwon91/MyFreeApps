import type { ArchivedRace } from "@/games/wow-forever/types/guild/archivedRace";

/**
 * Races the guild has finished, newest first. The Level board retired once the guild reached the cap, so its
 * winner lives here. ``day`` stays null unless a stored date proves it: nothing records when the first member
 * hit 60 (the daily metrics only say which days a member was looked up).
 */
export const ARCHIVED_RACES: readonly ArchivedRace[] = [
  {
    id: "race-to-60",
    title: "Race to 60",
    achievement: "first to level 60",
    winner: { slug: "ozrix-forever", name: "Ozrix", surname: "Forever", class_name: "Mage" },
    day: null,
  },
];

export const ARCHIVED_RACES_COPY = {
  listLabel: "Archived races",
  won: "Won by",
  on: (shortDay: string) => `on ${shortDay}`,
} as const;
