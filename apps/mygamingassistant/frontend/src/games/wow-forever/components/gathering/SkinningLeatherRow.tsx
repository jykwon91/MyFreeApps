import { levelRange } from "@/games/wow-forever/food/recipeSources";
import { skillToSkinRange } from "@/games/wow-forever/gathering/skinBandText";
import type { LeatherBracket } from "@/games/wow-forever/types/gathering/leatherBracket";

interface SkinningLeatherRowProps {
  bracket: LeatherBracket;
  /** Beasts in your band are in this bracket. */
  yours: boolean;
}

/** "Level 11–21 · skill 10–105 · Light Leather, …" */
export default function SkinningLeatherRow({ bracket, yours }: SkinningLeatherRowProps) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3" aria-current={yours || undefined}>
      <span className="font-medium capitalize">{levelRange([bracket.minLevel, bracket.maxLevel])}</span>
      <span className="text-sm text-muted-foreground">{skillToSkinRange(bracket.minLevel, bracket.maxLevel)}</span>
      <span className="text-sm">{bracket.leathers.join(", ")}</span>
      {yours && <span className="text-xs text-muted-foreground">your range</span>}
    </li>
  );
}
