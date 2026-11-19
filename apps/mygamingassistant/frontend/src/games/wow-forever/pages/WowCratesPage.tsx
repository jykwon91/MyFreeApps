import { useMemo } from "react";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import AuctionFactionSwitch from "@/games/wow-forever/components/auctionHouse/AuctionFactionSwitch";
import AuctionPriceFreshness from "@/games/wow-forever/components/auctionHouse/AuctionPriceFreshness";
import CratesFilters from "@/games/wow-forever/components/crates/CratesFilters";
import CratesGrid from "@/games/wow-forever/components/crates/CratesGrid";
import ProfessionEmpty from "@/games/wow-forever/components/professionTiers/ProfessionEmpty";
import ProfessionRowsSkeleton from "@/games/wow-forever/components/professionTiers/ProfessionRowsSkeleton";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { CRATES_SUBTITLE } from "@/games/wow-forever/data/professions/crates/cratesCopy";
import { CRATES_FILE } from "@/games/wow-forever/data/professions/crates/cratesData";
import { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";
import { useAuctionHouseFaction } from "@/games/wow-forever/hooks/useAuctionHouseFaction";
import { useAuctionPrices } from "@/games/wow-forever/hooks/useAuctionPrices";
import { useCrateView } from "@/games/wow-forever/hooks/useCrateView";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";
import { buildCrateRows } from "@/games/wow-forever/lib/crates/buildCrateRows";
import { filterCrateRows } from "@/games/wow-forever/lib/crates/filterCrateRows";
import { professionEmptyMessage } from "@/games/wow-forever/lib/professionTiers/professionEmptyMessage";
import { sortCrateRows } from "@/games/wow-forever/lib/crates/sortCrateRows";

/**
 * /wow-forever/crates — every Waylaid Crate with what the crate and its cheapest bundle cost on the auction house.
 * The crates are static data, so the rows show at once; prices fill in as they load (or stay "no auction price" if
 * they fail). The filter and order live in the link; the house in `?house=` like the Auction house.
 */
export default function WowCratesPage() {
  useDocumentTitle("Waylaid crates");
  const [house, setHouse] = useAuctionHouseFaction();
  const { status, prices, retry, retrying } = useAuctionPrices(house);
  const loading = status === LOAD_STATUS.loading;

  const rows = useMemo(() => buildCrateRows(CRATES_FILE, (id) => prices?.byId.get(id)?.marketValue), [prices]);
  const { view, setFilters, setSort, toggleSort, clearFilters } = useCrateView();
  const visible = useMemo(() => sortCrateRows(filterCrateRows(rows, view.filters), view.sort), [rows, view]);

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-6xl">
      <WowPageHeader title="Waylaid crates" subtitle={CRATES_SUBTITLE} backTo="/wow-forever" backLabel="Back to WoW Forever" />
      <AuctionFactionSwitch value={house} onChange={setHouse} />
      <AuctionPriceFreshness faction={house} />
      {status === LOAD_STATUS.error ? (
        <LoadErrorRetry message="Couldn't load prices — showing crates without prices." onRetry={retry} retrying={retrying} />
      ) : null}
      <CratesFilters
        rows={rows}
        shown={visible.length}
        filters={view.filters}
        sort={view.sort}
        onFilters={setFilters}
        onSort={setSort}
        onClear={clearFilters}
      />
      {visible.length > 0 ? <CratesGrid rows={visible} sort={view.sort} onSort={toggleSort} loading={loading} /> : null}
      {visible.length === 0 && loading ? <ProfessionRowsSkeleton label="Loading crates" testId="crates-skeleton" /> : null}
      {visible.length === 0 && !loading ? (
        <ProfessionEmpty message={professionEmptyMessage("crates", view.filters.query)} testId="crates-empty" onClear={clearFilters} />
      ) : null}
    </div>
  );
}
