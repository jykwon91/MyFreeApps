import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { ClassColor } from "@/games/wow-forever/types/guild/classColor";

/**
 * The game's class colours, for member names on the leaderboards. The dark values are the in-game colours; the
 * light ones are darkened to keep 4.5:1 contrast on a white card (plain Priest white, Rogue yellow would vanish).
 */
export const CLASS_COLORS: Record<WowClassId, ClassColor> = {
  warrior: { light: "#8A6232", dark: "#C79C6E" },
  paladin: { light: "#C2306F", dark: "#F58CBA" },
  hunter: { light: "#4F7A1F", dark: "#ABD473" },
  rogue: { light: "#7A6E00", dark: "#FFF569" },
  priest: { light: "#4B5563", dark: "#FFFFFF" },
  shaman: { light: "#0070DE", dark: "#4DA3FF" },
  mage: { light: "#17708F", dark: "#69CCF0" },
  warlock: { light: "#6551A8", dark: "#9482C9" },
  druid: { light: "#A84E00", dark: "#FF7D0A" },
};
