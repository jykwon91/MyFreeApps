import { useSearchParams } from "react-router-dom";
import { SAVINGS_CATEGORIES, SAVINGS_POLL_MS } from "@mybookkeeper/api-client/constants/savings";
import { useGetSavingsOverviewQuery } from "@mybookkeeper/api-client/store/savingsApi";
import type { SavingsCategory } from "@mybookkeeper/api-client/types/savings/savings-category";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import SavingsBody from "@/app/features/savings/SavingsBody";
import { SAVINGS_MESSAGES as MSG } from "@/shared/lib/savings-messages";
import { SAVINGS_CATEGORY_PARAM } from "@/shared/lib/savings-pages";

function isSavingsCategory(value: string | null): value is SavingsCategory {
  return value !== null && (SAVINGS_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Researched ways to save. The category filter is in the URL (``?category=``) so a reload keeps it;
 * changing it replaces the history entry. While a run is going a second subscription polls every few
 * seconds; it stops once the run finishes.
 */
export default function Savings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const asked = searchParams.get(SAVINGS_CATEGORY_PARAM);
  const category = isSavingsCategory(asked) ? asked : null;
  const query = useGetSavingsOverviewQuery();
  const running = query.data?.run_in_progress === true;
  useGetSavingsOverviewQuery(undefined, { pollingInterval: SAVINGS_POLL_MS, skip: !running });

  function changeCategory(next: SavingsCategory | null) {
    setSearchParams(next === null ? {} : { [SAVINGS_CATEGORY_PARAM]: next }, { replace: true });
  }

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <SectionHeader title={MSG.pageTitle} subtitle={MSG.pageSubtitle} />
      <SavingsBody
        data={query.data}
        isLoading={query.isLoading}
        isError={query.isError}
        isRetrying={query.isFetching}
        onRetry={() => void query.refetch()}
        category={category}
        onCategoryChange={changeCategory}
      />
    </div>
  );
}
