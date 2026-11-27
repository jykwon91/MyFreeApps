import { useLiveSearchParams } from "@platform/ui";
import { useGetPersonalFinancesQuery } from "@mybookkeeper/api-client/store/personalFinancesApi";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import PersonalFinancesBody from "@/app/features/personal-finances/PersonalFinancesBody";
import PersonalFinancesControls from "@/app/features/personal-finances/PersonalFinancesControls";
import {
  personalFinancesQueryFrom,
  personalFinancesSearchParams,
} from "@/app/features/personal-finances/personal-finances-search-params";
import type { PersonalFinancesQuery } from "@mybookkeeper/api-client/types/personal-finances/personal-finances-query";
import { PERSONAL_FINANCES_MESSAGES as MSG } from "@/shared/lib/personal-finances-messages";

/**
 * Money in and out through your accounts over a year, all time, or the months
 * dragged across on the chart. The range lives in the URL so a reload keeps
 * it; a change replaces the history entry.
 */
export default function PersonalFinances() {
  const [searchParams, setSearchParams] = useLiveSearchParams();
  const query = personalFinancesQueryFrom(searchParams);
  const result = useGetPersonalFinancesQuery(query);
  // The years stay on screen while a new range loads.
  const years = result.data?.years ?? [];
  const setQuery = (next: PersonalFinancesQuery) =>
    setSearchParams(() => new URLSearchParams(personalFinancesSearchParams(next)), { replace: true });

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <SectionHeader title={MSG.pageTitle} subtitle={MSG.pageSubtitle} />
      {years.length > 0 && <PersonalFinancesControls value={query} years={years} onChange={setQuery} />}
      <PersonalFinancesBody
        data={result.currentData}
        isLoading={result.currentData === undefined && result.isFetching}
        isError={result.isError}
        isRetrying={result.isFetching}
        onRetry={() => void result.refetch()}
        onRangeSelect={(range) => setQuery({ start: range.startDate.slice(0, 7), end: range.endDate.slice(0, 7) })}
      />
    </div>
  );
}
