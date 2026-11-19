import clsx from "clsx";
import CrateBundlesDisclosure from "@/games/wow-forever/components/crates/CrateBundlesDisclosure";
import CrateCheapestCell from "@/games/wow-forever/components/crates/CrateCheapestCell";
import CrateNameCell from "@/games/wow-forever/components/crates/CrateNameCell";
import CratePriceBreakdown from "@/games/wow-forever/components/crates/CratePriceBreakdown";
import CrateTotalCell from "@/games/wow-forever/components/crates/CrateTotalCell";
import { CRATE_ROW_GRID } from "@/games/wow-forever/components/crates/crateRowStyles";
import ProfessionPriceCell from "@/games/wow-forever/components/professionTiers/ProfessionPriceCell";
import ProfessionTierBadge from "@/games/wow-forever/components/professionTiers/ProfessionTierBadge";
import { PROFESSION_ROW_LOOK } from "@/games/wow-forever/components/professionTiers/professionRowStyles";
import { CRATE_TIER_LABEL } from "@/games/wow-forever/data/professions/crates/crateTiers";
import type { CrateRow } from "@/games/wow-forever/types/crates/crateRow";

interface CrateGridRowProps {
  row: CrateRow;
  /** True while the prices load: price cells show a skeleton. */
  loading: boolean;
}

/** One crate: a card on a phone (name and tier, cheapest bundle, big total, the sum, all bundles), a table row from lg up. */
export default function CrateGridRow({ row, loading }: CrateGridRowProps) {
  const { crate } = row;
  const dimmed = !loading && row.total === null;
  return (
    <div
      role="row"
      data-testid="crate-row"
      data-tier={crate.tier}
      className={clsx(CRATE_ROW_GRID, PROFESSION_ROW_LOOK, dimmed && "opacity-70")}
    >
      <div role="cell" className="flex min-w-0 flex-wrap items-center gap-x-2">
        <CrateNameCell crate={crate} />
        <ProfessionTierBadge label={CRATE_TIER_LABEL[crate.tier]} testId="crate-tier" className="lg:hidden" />
      </div>
      <div role="cell" className="hidden lg:block">
        <ProfessionTierBadge label={CRATE_TIER_LABEL[crate.tier]} testId="crate-tier" />
      </div>
      <div role="cell" className="hidden lg:block">
        <ProfessionPriceCell copper={row.cratePrice} loading={loading} />
      </div>
      <div role="cell" className="min-w-0">
        <CrateCheapestCell cheapest={row.cheapest} loading={loading} />
      </div>
      <div role="cell" className="hidden lg:block" data-testid="crate-bundle-cost">
        <ProfessionPriceCell copper={row.bundleCost} loading={loading} />
      </div>
      <div role="cell">
        <CrateTotalCell row={row} loading={loading} />
      </div>
      <div role="cell" className="lg:hidden">
        {loading ? null : <CratePriceBreakdown row={row} />}
      </div>
      <div role="cell" className="lg:col-span-full">
        <CrateBundlesDisclosure bundles={row.bundles} loading={loading} />
      </div>
    </div>
  );
}
