/** Medal circles for ranks 1-3 (gold, silver, bronze): dark text on gold and silver, white on bronze, for contrast. */
export const MEDAL_STYLES: Record<number, string> = {
  1: "bg-[#F2C94C] text-slate-900 ring-[#B8902A]",
  2: "bg-[#C9CED6] text-slate-900 ring-[#8E959F]",
  3: "bg-[#9A5B1F] text-white ring-[#6E3F12]",
};
/** 1st place's gold: the podium card's border and its crown. */
export const GOLD_BORDER = "border-[#B8902A]";
export const GOLD_TEXT = "text-[#B8902A]";
/** The rank badge below the podium. */
export const RANK_BADGE = "bg-muted text-foreground ring-transparent";
/** A medal's size: in a row, and on a podium card. */
export const MEDAL_SIZE = { row: "h-8 w-8 text-sm", podium: "h-11 w-11 text-lg" } as const;
