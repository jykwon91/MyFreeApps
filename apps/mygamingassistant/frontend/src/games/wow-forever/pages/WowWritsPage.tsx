import { useMemo } from "react";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import AuctionFactionSwitch from "@/games/wow-forever/components/auctionHouse/AuctionFactionSwitch";
import AuctionPriceFreshness from "@/games/wow-forever/components/auctionHouse/AuctionPriceFreshness";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import ProfessionEmpty from "@/games/wow-forever/components/professionTiers/ProfessionEmpty";
import ProfessionRowsSkeleton from "@/games/wow-forever/components/professionTiers/ProfessionRowsSkeleton";
import WritsFilters from "@/games/wow-forever/components/writs/WritsFilters";
import WritsGrid from "@/games/wow-forever/components/writs/WritsGrid";
import { WRITS_FILE } from "@/games/wow-forever/data/professions/writs/writsData";
import { WRITS_SUBTITLE } from "@/games/wow-forever/data/professions/writs/writsCopy";
import { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";
import { useAuctionHouseFaction } from "@/games/wow-forever/hooks/useAuctionHouseFaction";
import { useAuctionPrices } from "@/games/wow-forever/hooks/useAuctionPrices";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";
import { useWritView } from "@/games/wow-forever/hooks/useWritView";
import { buildWritRows } from "@/games/wow-forever/lib/writs/buildWritRows";
import { filterWritRows } from "@/games/wow-forever/lib/writs/filterWritRows";
import { professionEmptyMessage } from "@/games/wow-forever/lib/professionTiers/professionEmptyMessage";
import { sortWritRows } from "@/games/wow-forever/lib/writs/sortWritRows";
import { knownLocations } from "@/games/wow-forever/lib/writs/writFacets";

/**
 * /wow-forever/writs — every Craftsman's Writ with what the writ and the item it asks for cost on the auction
 * house, cheapest first. The writs are static data, so the rows show at once; prices fill in as they load (or stay
 * "no auction price" if they fail). Filters and order live in the link; the house in `?house=` like the Auction house.
 */
export default function WowWritsPage() {
  useDocumentTitle("Crafting writs");
  const [house, setHouse] = useAuctionHouseFaction();
  const { status, prices, retry, retrying } = useAuctionPrices(house);
  const loading = status === LOAD_STATUS.loading;

  const rows = useMemo(
    () => buildWritRows(WRITS_FILE, (id) => prices?.byId.get(id)?.marketValue, house === "neutral" ? null : house),
    [prices, house],
  );
  const locations = useMemo(() => knownLocations(WRITS_FILE.turnIns), []);
  const { view, setFilters, setSort, toggleSort, clearFilters } = useWritView(locations);
  const visible = useMemo(() => sortWritRows(filterWritRows(rows, view.filters), view.sort), [rows, view]);

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-6xl">
      <WowPageHeader
        title="Crafting writs"
        subtitle={WRITS_SUBTITLE}
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      <AuctionFactionSwitch value={house} onChange={setHouse} />
      <AuctionPriceFreshness faction={house} />
      {status === LOAD_STATUS.error ? (
        <LoadErrorRetry message="Couldn't load prices — showing writs without prices." onRetry={retry} retrying={retrying} />
      ) : null}
      <WritsFilters
        rows={rows}
        locations={locations}
        shown={visible.length}
        filters={view.filters}
        sort={view.sort}
        onFilters={setFilters}
        onSort={setSort}
        onClear={clearFilters}
      />
      {visible.length > 0 ? <WritsGrid rows={visible} sort={view.sort} onSort={toggleSort} loading={loading} /> : null}
      {visible.length === 0 && loading ? <ProfessionRowsSkeleton label="Loading writs" testId="writs-skeleton" /> : null}
      {visible.length === 0 && !loading ? <ProfessionEmpty message={professionEmptyMessage("writs", view.filters.query)} testId="writs-empty" onClear={clearFilters} /> : null}
    </div>
  );
}
