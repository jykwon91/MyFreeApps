import { useMemo } from "react";
import AuctionResults from "@/games/wow-forever/components/auctionHouse/AuctionResults";
import ProfessionMaterialsNote from "@/games/wow-forever/components/auctionHouse/ProfessionMaterialsNote";
import { searchProfessionMaterials } from "@/games/wow-forever/lib/auctionHouse/professionMaterials";
import type { AuctionPrices } from "@/games/wow-forever/types/auctionPrices";
import type { AuctionSort } from "@/games/wow-forever/types/auctionSort";

interface ProfessionMaterialsBodyProps {
  materials: ReadonlyMap<number, string>;
  professionLabel: string;
  prices: AuctionPrices;
  query: string;
  sort: AuctionSort;
}

/** The house's prices for one profession's materials, searched and sorted like the full list. */
export default function ProfessionMaterialsBody({ materials, professionLabel, prices, query, sort }: ProfessionMaterialsBodyProps) {
  const result = useMemo(() => searchProfessionMaterials(materials, prices.byId, query, sort), [materials, prices, query, sort]);
  const typed = query.trim();
  const emptyMessage = typed
    ? `No ${professionLabel} materials on sale match "${typed}".`
    : `None of the ${professionLabel} materials are on sale on this auction house right now.`;
  return (
    <AuctionResults
      result={result}
      emptyMessage={emptyMessage}
      note={<ProfessionMaterialsNote result={result} professionLabel={professionLabel} />}
    />
  );
}
