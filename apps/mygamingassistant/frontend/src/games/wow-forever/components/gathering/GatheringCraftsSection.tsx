import MiningSmeltRow from "@/games/wow-forever/components/gathering/MiningSmeltRow";
import type { GatheringCrafts } from "@/games/wow-forever/types/gathering/gatheringCrafts";
import type { MiningFile } from "@/games/wow-forever/types/gathering/miningFile";

interface GatheringCraftsSectionProps {
  crafts: GatheringCrafts;
  file: MiningFile;
}

/** Smelting and camp items, collapsed — generated from the Forever client's Mining recipes. */
export default function GatheringCraftsSection({ crafts, file }: GatheringCraftsSectionProps) {
  return (
    <details className="rounded-xl border bg-card" data-testid="gathering-crafts">
      <summary className="cursor-pointer p-3 font-medium min-h-[44px]">{crafts.title}</summary>
      <p className="px-3 text-sm text-muted-foreground">{crafts.intro}</p>
      <ul className="divide-y" aria-label={crafts.title}>
        {file.smelting.map((recipe) => (
          <MiningSmeltRow key={recipe.spell} recipe={recipe} where={`at a ${recipe.focus}`} />
        ))}
      </ul>
      <h3 className="px-3 pt-2 text-sm font-medium">Camp items</h3>
      <ul className="divide-y" aria-label="Camp items">
        {file.camp.map((recipe) => (
          <MiningSmeltRow key={recipe.spell} recipe={recipe} where="" />
        ))}
      </ul>
    </details>
  );
}
