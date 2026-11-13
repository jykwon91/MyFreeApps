import AuctionFactionSwitch from "@/games/wow-forever/components/auctionHouse/AuctionFactionSwitch";
import AuctionLookup from "@/games/wow-forever/components/auctionHouse/AuctionLookup";
import AuctionProfessionSelect from "@/games/wow-forever/components/auctionHouse/AuctionProfessionSelect";
import PricesAddonCard from "@/games/wow-forever/components/auctionHouse/PricesAddonCard";
import ProfessionAuction from "@/games/wow-forever/components/auctionHouse/ProfessionAuction";
import PriceStatus from "@/games/wow-forever/components/prices/PriceStatus";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { AUCTION_MATERIAL_PROFESSIONS } from "@/games/wow-forever/data/auctionHouse/auctionMaterialProfessions";
import { useAuctionFilters } from "@/games/wow-forever/hooks/useAuctionFilters";
import { useAuctionMaterialFilter } from "@/games/wow-forever/hooks/useAuctionMaterialFilter";
import { useAuctionHouseFaction } from "@/games/wow-forever/hooks/useAuctionHouseFaction";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";

/**
 * /wow-forever/auction-house — look up any item's auction price on your faction's
 * (or Blackwater's) houses. The search, order and every filter live in the URL
 * (`?q=`, `?sort=`, `?quality=`, `?min=`…) so a view can be shared; `?prof=`
 * narrows it to a profession's materials and `?recipe=` to one recipe's.
 */
export default function WowAuctionHousePage() {
  useDocumentTitle("Auction house prices");
  const [house, setHouse] = useAuctionHouseFaction();
  const { filters, update, clear } = useAuctionFilters();
  const material = useAuctionMaterialFilter();
  const professionLabel = AUCTION_MATERIAL_PROFESSIONS.find((p) => p.id === material.profession)?.label ?? "";

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
      <AuctionProfessionSelect value={material.profession} onChange={material.setProfession} />
      {material.profession ? (
        <ProfessionAuction
          profession={material.profession}
          professionLabel={professionLabel}
          house={house}
          recipe={material.recipe}
          onRecipe={material.setRecipe}
          filters={filters}
          onFilters={update}
          onClearFilters={clear}
        />
      ) : (
        <AuctionLookup house={house} filters={filters} onFilters={update} onClear={clear} materials={null} professionLabel={null} />
      )}
    </div>
  );
}
