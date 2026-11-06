import SkinningLeatherRow from "@/games/wow-forever/components/gathering/SkinningLeatherRow";
import type { LeatherBracket } from "@/games/wow-forever/types/gathering/leatherBracket";
import type { SkinBand } from "@/games/wow-forever/types/gathering/skinBand";

interface SkinningLeatherTableProps {
  leather: readonly LeatherBracket[];
  /** Your band — its brackets are marked. */
  band: Pick<SkinBand, "min" | "max">;
}

/** What each beast level skins into and the skill it takes, collapsed. */
export default function SkinningLeatherTable({ leather, band }: SkinningLeatherTableProps) {
  return (
    <details className="rounded-xl border bg-card" data-testid="leather-table">
      <summary className="cursor-pointer p-3 font-medium min-h-[44px]">Leather by beast level</summary>
      <p className="px-3 text-xs text-muted-foreground">
        Classic data — mob levels, what they skin into and the skill rule may differ in Forever.
      </p>
      <ul className="divide-y">
        {leather.map((bracket) => (
          <SkinningLeatherRow
            key={bracket.minLevel}
            bracket={bracket}
            yours={bracket.minLevel <= band.max && bracket.maxLevel >= band.min}
          />
        ))}
      </ul>
    </details>
  );
}
