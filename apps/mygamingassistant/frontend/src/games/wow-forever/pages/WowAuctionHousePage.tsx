import { useState } from "react";
import { useLiveSearchParams } from "@platform/ui";
import AuctionFactionSwitch from "@/games/wow-forever/components/auctionHouse/AuctionFactionSwitch";
import AuctionHouseBody from "@/games/wow-forever/components/auctionHouse/AuctionHouseBody";
import AuctionProfessionSelect from "@/games/wow-forever/components/auctionHouse/AuctionProfessionSelect";
import AuctionReadyBody from "@/games/wow-forever/components/auctionHouse/AuctionReadyBody";
import AuctionSearchControls from "@/games/wow-forever/components/auctionHouse/AuctionSearchControls";
import PricesAddonCard from "@/games/wow-forever/components/auctionHouse/PricesAddonCard";
import ProfessionAuction from "@/games/wow-forever/components/auctionHouse/ProfessionAuction";
import PriceStatus from "@/games/wow-forever/components/prices/PriceStatus";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { AUCTION_MATERIAL_PROFESSIONS } from "@/games/wow-forever/data/auctionHouse/auctionMaterialProfessions";
import { AUCTION_QUERY_PARAM } from "@/games/wow-forever/data/auctionHouse/auctionHouseParams";
import { DEFAULT_AUCTION_SORT } from "@/games/wow-forever/data/auctionSortOptions";
import { useAuctionMaterialFilter } from "@/games/wow-forever/hooks/useAuctionMaterialFilter";
import { useAuctionHouseFaction } from "@/games/wow-forever/hooks/useAuctionHouseFaction";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";
import type { AuctionSort } from "@/games/wow-forever/types/auctionSort";

/**
 * /wow-forever/auction-house — look up any item's auction price on your faction's
 * (or Blackwater's) houses. The search lives in `?q=` so a lookup can be shared;
 * `?prof=` narrows it to a profession's materials and `?recipe=` to one recipe's.
 */
export default function WowAuctionHousePage() {
  useDocumentTitle("Auction house prices");
  const [params, setParams] = useLiveSearchParams();
  const [sort, setSort] = useState<AuctionSort>(DEFAULT_AUCTION_SORT);
  const [house, setHouse] = useAuctionHouseFaction();
  const query = params.get(AUCTION_QUERY_PARAM) ?? "";
  const filter = useAuctionMaterialFilter();
  const professionLabel = AUCTION_MATERIAL_PROFESSIONS.find((p) => p.id === filter.profession)?.label ?? "";

  function changeQuery(next: string) {
    setParams(
      (prev) => {
        if (next) prev.set(AUCTION_QUERY_PARAM, next);
        else prev.delete(AUCTION_QUERY_PARAM);
        return prev;
      },
      { replace: true },
    );
  }

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-4xl">
      <WowPageHeader
        title="Auction house prices"
        subtitle="Look up what any item sells for on the US auction houses, straight from Blizzard, or price a profession's materials and recipes."
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      <AuctionFactionSwitch value={house} onChange={setHouse} />
      <PriceStatus faction={house} withoutPrices="no prices to show" hideError />
      <PricesAddonCard />
      <AuctionProfessionSelect value={filter.profession} onChange={filter.setProfession} />
      {filter.profession ? (
        <ProfessionAuction
          profession={filter.profession}
          professionLabel={professionLabel}
          house={house}
          recipe={filter.recipe}
          onRecipe={filter.setRecipe}
          query={query}
          onQuery={changeQuery}
          sort={sort}
          onSort={setSort}
        />
      ) : (
        <>
          <AuctionSearchControls query={query} onQuery={changeQuery} sort={sort} onSort={setSort} />
          <AuctionHouseBody faction={house}>{(prices) => <AuctionReadyBody prices={prices} query={query} sort={sort} />}</AuctionHouseBody>
        </>
      )}
    </div>
  );
}
