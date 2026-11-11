import AuctionFigure from "@/games/wow-forever/components/auctionHouse/AuctionFigure";
import { AUCTION_ROW_LOOK, RECIPE_ROW_GRID } from "@/games/wow-forever/components/auctionHouse/auctionGrid";
import ItemIcon from "@/games/wow-forever/components/shared/ItemIcon";
import { itemLabel, onSaleText, priceOrDash } from "@/games/wow-forever/prices/auctionFormat";
import type { RecipePriceLine } from "@/games/wow-forever/types/auctionHouse/recipePriceLine";

export default function RecipeMaterialRow({ line }: { line: RecipePriceLine }) {
  return (
    <li className={`${RECIPE_ROW_GRID} ${AUCTION_ROW_LOOK}`} data-testid="recipe-material">
      <span className="col-span-2 sm:col-span-1 inline-flex min-h-[44px] items-center font-medium break-words">
        <ItemIcon itemId={line.itemId} />
        {itemLabel(line.name, line.itemId)}
      </span>
      <AuctionFigure label="Need" value={`×${line.count}`} testId="recipe-need" />
      <AuctionFigure label="Each" value={priceOrDash(line.price?.marketValue ?? null)} testId="recipe-each" />
      <AuctionFigure label="Cost" value={priceOrDash(line.cost)} testId="recipe-cost" />
      <AuctionFigure
        label="On sale"
        value={line.price ? onSaleText(line.price.quantity, line.price.listings) : "No auctions"}
        testId="recipe-on-sale"
      />
    </li>
  );
}
