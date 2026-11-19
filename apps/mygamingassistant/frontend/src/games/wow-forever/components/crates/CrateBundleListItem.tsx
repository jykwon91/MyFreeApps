import { Check } from "lucide-react";
import CrateBundleLabel from "@/games/wow-forever/components/crates/CrateBundleLabel";
import ProfessionPriceCell from "@/games/wow-forever/components/professionTiers/ProfessionPriceCell";
import { CRATE_CHEAPEST_LABEL } from "@/games/wow-forever/data/professions/crates/cratesCopy";
import type { CrateBundleRow } from "@/games/wow-forever/types/crates/crateBundleRow";

interface CrateBundleListItemProps {
  row: CrateBundleRow;
  loading: boolean;
}

/** One bundle: how many of what, the price of one, what the bundle costs, and a mark on the cheapest. */
export default function CrateBundleListItem({ row, loading }: CrateBundleListItemProps) {
  return (
    <li
      data-testid="crate-bundle"
      data-cheapest={row.cheapest}
      className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-card px-3 py-1"
    >
      <span className="min-w-0 flex-1 basis-48">
        <CrateBundleLabel bundle={row.bundle} />
      </span>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        each <ProfessionPriceCell copper={row.unitPrice} loading={loading} />
      </span>
      <span className="flex items-center gap-1 text-sm">
        <span className="text-xs text-muted-foreground">Bundle</span>
        <ProfessionPriceCell copper={row.cost} loading={loading} />
      </span>
      {row.cheapest && !loading ? (
        <span
          data-testid="crate-bundle-cheapest"
          className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400"
        >
          <Check className="h-3 w-3" aria-hidden />
          {CRATE_CHEAPEST_LABEL}
        </span>
      ) : null}
    </li>
  );
}
