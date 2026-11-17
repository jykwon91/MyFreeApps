/** Copy for a crafting guide's "Camp objects" section. */
export const CAMP_OBJECTS_TEXT = {
  id: "camp",
  title: "Camp objects",
  navLabel: "Camp objects",
  intro:
    "Forever's camping: build these and place them next to a campfire, and everyone sitting nearby gets their effect. A bigger one replaces the smaller one and keeps its effect. All camp objects share a 1-hour cooldown.",
  levelNote: "Buff numbers are the level 60 ones — lower levels get less.",
  skill: (skill: number) => `Skill ${skill}`,
  trainer: (profession: string) => `Any ${profession} trainer, or the Camping 101 quest`,
  trainerDetail: "Player guides report the trainer and the Camping 101 quest; the game files don't say.",
  blueprint: (item: string, skill: number) => `${item} (needs skill ${skill})`,
  dropsFrom: (boss: string, place: string) => `Drops from ${boss} in ${place}`,
  dropDetail: "From player guides — Blueprint drops are server-side, so the game files don't list them.",
  dropUnknown: "Where it drops isn't known yet.",
  learnLabel: "How to learn it",
  materialsLabel: "Materials",
} as const;
