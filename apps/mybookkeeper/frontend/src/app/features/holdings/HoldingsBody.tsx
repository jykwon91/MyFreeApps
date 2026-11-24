import type { Holding } from "@mybookkeeper/api-client/types/investments/holding";
import type { HoldingList } from "@mybookkeeper/api-client/types/investments/holding-list";
import EmptyState from "@/shared/components/ui/EmptyState";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";
import { HOLDINGS_MESSAGES as MSG } from "@/shared/lib/holdings-messages";
import HoldingsAllocationChart from "./HoldingsAllocationChart";
import HoldingsList from "./HoldingsList";
import HoldingsSkeleton from "./HoldingsSkeleton";
import HoldingsTotals from "./HoldingsTotals";

export interface HoldingsBodyProps {
  data: HoldingList | undefined;
  isLoading: boolean;
  isError: boolean;
  isRetrying: boolean;
  onRetry: () => void;
  /** The empty message fits what can be done: add by hand, or wait for the bank. */
  canAddManually: boolean;
  onAdd: () => void;
  onEdit: (holding: Holding) => void;
  onRemove: (holding: Holding) => void;
}

export default function HoldingsBody({
  data, isLoading, isError, isRetrying, onRetry, canAddManually, onAdd, onEdit, onRemove,
}: HoldingsBodyProps) {
  if (isLoading) return <HoldingsSkeleton />;
  if (isError || !data) return <LoadErrorAlert message={MSG.loadFailed} isRetrying={isRetrying} onRetry={onRetry} />;

  if (data.holdings.length === 0) {
    return (
      <div className="border rounded-lg" data-testid="holdings-empty">
        <EmptyState
          message={canAddManually ? MSG.noHoldingsManual : MSG.noHoldingsSynced}
          action={canAddManually ? { label: MSG.addFirst, onClick: onAdd } : undefined}
        />
      </div>
    );
  }

  const hasStalePrice = data.holdings.some((holding) => holding.is_price_stale);
  return (
    <div className="space-y-6">
      <HoldingsTotals totals={data.totals} currency={data.currency} />
      {hasStalePrice ? (
        <p className="text-xs rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300" data-testid="holdings-stale-hint">
          {MSG.staleHint}
        </p>
      ) : null}
      <section className="border rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold">{MSG.allocationTitle}</h2>
        <HoldingsAllocationChart allocation={data.allocation} currency={data.currency} />
      </section>
      <section className="border rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold">{MSG.holdingsTitle}</h2>
        <HoldingsList
          holdings={data.holdings}
          showAccount={data.financial_account_id === null}
          onEdit={onEdit}
          onRemove={onRemove}
        />
      </section>
    </div>
  );
}
