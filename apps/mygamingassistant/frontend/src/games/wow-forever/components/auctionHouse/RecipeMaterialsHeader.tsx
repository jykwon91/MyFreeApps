import { RECIPE_ROW_GRID } from "@/games/wow-forever/components/auctionHouse/auctionGrid";

/** Column titles for a recipe's materials. On a phone each card labels its own figures. */
export default function RecipeMaterialsHeader() {
  return (
    <div className={`${RECIPE_ROW_GRID} hidden border-b py-2 text-xs font-medium text-muted-foreground sm:grid`} aria-hidden>
      <span>Material</span>
      <span>Need</span>
      <span>Each</span>
      <span>Cost</span>
      <span>On sale</span>
    </div>
  );
}
