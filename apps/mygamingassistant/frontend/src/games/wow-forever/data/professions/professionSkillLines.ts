import type { GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";

/** Each profession's client SkillLine id — the key of its icon in `wowIcons.json`'s `skills`. */
export const PROFESSION_SKILL_LINES: Readonly<Record<GuideProfession, number>> = {
  firstaid: 129,
  blacksmithing: 164,
  leatherworking: 165,
  alchemy: 171,
  herbalism: 182,
  cooking: 185,
  mining: 186,
  tailoring: 197,
  engineering: 202,
  enchanting: 333,
  fishing: 356,
  skinning: 393,
};
