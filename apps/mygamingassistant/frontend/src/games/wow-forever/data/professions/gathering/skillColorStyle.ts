import type { SkillColor } from "@/games/wow-forever/types/gathering/skillColor";

/** How each node colour is shown — the word carries it, the swatch only backs it up. */
export const SKILL_COLOR_STYLE: Readonly<Record<SkillColor, { label: string; swatch: string }>> = {
  red: { label: "Too high", swatch: "bg-red-500" },
  orange: { label: "Orange", swatch: "bg-orange-500" },
  yellow: { label: "Yellow", swatch: "bg-yellow-400" },
  green: { label: "Green", swatch: "bg-green-500" },
  grey: { label: "Gray", swatch: "bg-gray-400" },
};
