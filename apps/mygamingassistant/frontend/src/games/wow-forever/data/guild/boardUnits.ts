import type { BoardUnit } from "@/games/wow-forever/types/guild/boardUnit";

/** What each board counts, for "12 HKs behind". Profession boards (`prof-*`) fall back to skill points. */
export const BOARD_UNITS: Readonly<Record<string, BoardUnit>> = {
  level: { one: "level", many: "levels" },
  "item-level": { one: "item level", many: "item levels" },
  dungeons: { one: "dungeon", many: "dungeons" },
  "fewest-deaths": { one: "death", many: "deaths" },
  "honorable-kills": { one: "HK", many: "HKs" },
  "killing-blows": { one: "killing blow", many: "killing blows" },
  "deaths-to-players": { one: "death", many: "deaths" },
  "total-kills": { one: "kill", many: "kills" },
  exalted: { one: "exalted reputation", many: "exalted reputations" },
  "levels-gained": { one: "level", many: "levels" },
  "dungeons-gained": { one: "dungeon clear", many: "dungeon clears" },
  "honorable-kills-gained": { one: "HK", many: "HKs" },
  "killing-blows-gained": { one: "killing blow", many: "killing blows" },
  "total-kills-gained": { one: "kill", many: "kills" },
};

export const DEFAULT_BOARD_UNIT: BoardUnit = { one: "skill point", many: "skill points" };
