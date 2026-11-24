import { useLiveSearchParams } from "@platform/ui";
import { useGetCashFlowQuery } from "@mybookkeeper/api-client/store/budgetApi";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import CashFlowBody from "@/app/features/cash-flow/CashFlowBody";
import CashFlowControls from "@/app/features/cash-flow/CashFlowControls";
import { cashFlowQueryFrom, cashFlowSearchParams } from "@/app/features/cash-flow/cash-flow-search-params";
import { CASH_FLOW_MESSAGES as MSG } from "@/shared/lib/cash-flow-messages";

/**
 * Money in against money out per month. Range, scope and account live in the
 * URL so a reload keeps them; a change replaces the history entry. Each change
 * starts from the live address, so two quick picks never undo each other.
 */
export default function CashFlow() {
  const [searchParams, setSearchParams] = useLiveSearchParams();
  const cashFlowQuery = cashFlowQueryFrom(searchParams);
  const query = useGetCashFlowQuery(cashFlowQuery);

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <SectionHeader title={MSG.pageTitle} subtitle={MSG.pageSubtitle} />
      <CashFlowControls
        value={cashFlowQuery}
        onChange={(change) =>
          setSearchParams(
            (live) => new URLSearchParams(cashFlowSearchParams({ ...cashFlowQueryFrom(live), ...change })),
            { replace: true },
          )
        }
      />
      <CashFlowBody
        data={query.currentData}
        isLoading={query.currentData === undefined && query.isFetching}
        isError={query.isError}
        isRetrying={query.isFetching}
        onRetry={() => void query.refetch()}
      />
    </div>
  );
}
