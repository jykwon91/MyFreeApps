import type { ProfessionMaterialsResult } from "@/games/wow-forever/types/auctionHouse/professionMaterialsResult";

interface ProfessionMaterialsNoteProps {
  result: ProfessionMaterialsResult;
  professionLabel: string;
}

/** "34 Enchanting materials on sale", plus how many others have no auctions right now. */
export default function ProfessionMaterialsNote({ result, professionLabel }: ProfessionMaterialsNoteProps) {
  const noun = result.total === 1 ? "material" : "materials";
  const shown = result.capped ? `Showing ${result.items.length} of ${result.total}` : `${result.total}`;
  return (
    <p className="text-sm" aria-live="polite" data-testid="auction-results-note">
      {shown} {professionLabel} {noun} on sale
      {result.notOnSale > 0 && (
        <span className="text-muted-foreground"> · {result.notOnSale} more have no auctions right now</span>
      )}
    </p>
  );
}
