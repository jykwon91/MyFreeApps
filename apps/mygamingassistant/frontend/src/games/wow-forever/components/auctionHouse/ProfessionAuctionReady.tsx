import { useMemo } from "react";
import AuctionHouseBody from "@/games/wow-forever/components/auctionHouse/AuctionHouseBody";
import AuctionSearchControls from "@/games/wow-forever/components/auctionHouse/AuctionSearchControls";
import BackToMaterialsButton from "@/games/wow-forever/components/auctionHouse/BackToMaterialsButton";
import ProfessionMaterialsBody from "@/games/wow-forever/components/auctionHouse/ProfessionMaterialsBody";
import RecipeFinder from "@/games/wow-forever/components/auctionHouse/RecipeFinder";
import RecipePricePanel from "@/games/wow-forever/components/auctionHouse/RecipePricePanel";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import { professionMaterials, recipeOptions } from "@/games/wow-forever/lib/auctionHouse/professionMaterials";
import type { ProfessionAuctionProps } from "@/games/wow-forever/types/auctionHouse/professionAuctionProps";
import type { CraftingData } from "@/games/wow-forever/types/craftingData";

/** A profession's loaded recipes: the recipe finder + materials list, or one recipe's prices. */
export default function ProfessionAuctionReady({ data, professionLabel, house, recipe, onRecipe, query, onQuery, sort, onSort }: ProfessionAuctionProps & { data: CraftingData }) {
  const materials = useMemo(() => professionMaterials(data.file.recipes), [data]);
  const options = useMemo(() => recipeOptions(data.file.recipes), [data]);

  if (recipe !== null) {
    const picked = data.recipes.get(recipe);
    return (
      <div className="space-y-4">
        <BackToMaterialsButton professionLabel={professionLabel} onClick={() => onRecipe(null)} />
        {picked ? (
          <AuctionHouseBody faction={house}>{(prices) => <RecipePricePanel recipe={picked} prices={prices} />}</AuctionHouseBody>
        ) : (
          <EmptyStateNote message={`That ${professionLabel} recipe wasn't found. Pick another from the list.`} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <RecipeFinder options={options} professionLabel={professionLabel} onPick={onRecipe} />
      <AuctionSearchControls query={query} onQuery={onQuery} sort={sort} onSort={onSort} />
      <AuctionHouseBody faction={house}>
        {(prices) => (
          <ProfessionMaterialsBody materials={materials} professionLabel={professionLabel} prices={prices} query={query} sort={sort} />
        )}
      </AuctionHouseBody>
    </div>
  );
}
