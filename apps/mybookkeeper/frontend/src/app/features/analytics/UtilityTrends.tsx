import { useSearchParams, Link } from "react-router-dom";
import { subMonths, format, startOfMonth, endOfMonth } from "date-fns";
import { useGetUtilityTrendsQuery } from "@/shared/store/analyticsApi";
import { useGetPropertiesQuery } from "@/shared/store/propertiesApi";
import AnalyticsSkeleton from "./AnalyticsSkeleton";
import AnalyticsFilters from "./AnalyticsFilters";
import UtilityTrendsChart from "./UtilityTrendsChart";
import UtilitySummaryCards from "./UtilitySummaryCards";
import Card from "@/shared/components/ui/Card";

type Granularity = "monthly" | "quarterly";

function getDefaultFrom(): string {
  return format(startOfMonth(subMonths(new Date(), 11)), "yyyy-MM-dd");
}

function getDefaultTo(): string {
  return format(endOfMonth(new Date()), "yyyy-MM-dd");
}

function formatDisplayDate(dateStr: string): string {
  try {
    return format(new Date(dateStr + "T00:00:00"), "MMM d, yyyy");
  } catch {
    return dateStr;
  }
}

export default function UtilityTrends() {
  const [searchParams, setSearchParams] = useSearchParams();

  const fromDate = searchParams.get("from") ?? getDefaultFrom();
  const toDate = searchParams.get("to") ?? getDefaultTo();
  const granularity = (searchParams.get("granularity") ?? "monthly") as Granularity;
  const propertiesParam = searchParams.get("properties") ?? "";
  const propertyIds = propertiesParam ? propertiesParam.split(",").filter(Boolean) : [];

  function setParam(key: string, value: string) {
    setSearchParams(
      (prev) => {
        if (value) {
          prev.set(key, value);
        } else {
          prev.delete(key);
        }
        return prev;
      },
      { replace: true },
    );
  }

  function handleFromDate(v: string) {
    setParam("from", v);
  }

  function handleToDate(v: string) {
    setParam("to", v);
  }

  function handleGranularity(v: Granularity) {
    setParam("granularity", v);
  }

  function handlePropertyIds(ids: string[]) {
    setSearchParams(
      (prev) => {
        if (ids.length > 0) {
          prev.set("properties", ids.join(","));
        } else {
          prev.delete("properties");
        }
        return prev;
      },
      { replace: true },
    );
  }

  const isDefaultFrom = fromDate === getDefaultFrom();
  const isDefaultTo = toDate === getDefaultTo();
  const isDefaultGranularity = granularity === "monthly";
  const hasActiveFilters =
    !isDefaultFrom || !isDefaultTo || !isDefaultGranularity || propertyIds.length > 0;

  function handleClearFilters() {
    setSearchParams(
      (prev) => {
        prev.delete("from");
        prev.delete("to");
        prev.delete("granularity");
        prev.delete("properties");
        return prev;
      },
      { replace: true },
    );
  }

  const queryParams =
    fromDate || toDate || propertyIds.length > 0 || granularity !== "monthly"
      ? {
          startDate: fromDate || undefined,
          endDate: toDate || undefined,
          propertyIds: propertyIds.length > 0 ? propertyIds : undefined,
          granularity,
        }
      : undefined;

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useGetUtilityTrendsQuery(queryParams, {
    refetchOnMountOrArgChange: 300,
  });

  const { data: properties = [] } = useGetPropertiesQuery();

  if (isLoading) {
    return <AnalyticsSkeleton />;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
        <p className="text-muted-foreground">
          I ran into a problem loading your utility data. Want me to try again?
        </p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const trends = data?.trends ?? [];
  const summary = data?.summary ?? {};
  const totalSpend = data?.total_spend ?? 0;

  // No utility data at all (across all time, not just range)
  if (trends.length === 0 && !hasActiveFilters) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <p className="text-muted-foreground max-w-sm">
          I haven't found any utility expenses yet. Upload invoices or receipts from your utility
          providers and I'll track them here.
        </p>
        <Link
          to="/documents"
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          Upload documents
        </Link>
      </div>
    );
  }

  // Filters active but no data in range
  if (trends.length === 0 && hasActiveFilters) {
    return (
      <div className="space-y-4">
        <AnalyticsFilters
          fromDate={fromDate}
          toDate={toDate}
          granularity={granularity}
          propertyIds={propertyIds}
          properties={properties}
          onFromDate={handleFromDate}
          onToDate={handleToDate}
          onGranularity={handleGranularity}
          onPropertyIds={handlePropertyIds}
          hasActiveFilters={hasActiveFilters}
          onClear={handleClearFilters}
        />
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <p className="text-muted-foreground">
            No utility expenses found between {formatDisplayDate(fromDate)} and{" "}
            {formatDisplayDate(toDate)}.
          </p>
          <button
            onClick={handleClearFilters}
            className="px-4 py-2 text-sm font-medium border rounded-md hover:bg-muted transition-colors"
          >
            Reset date range
          </button>
        </div>
      </div>
    );
  }

  // Only 1 data point — can't show a trend
  const uniquePeriods = new Set(trends.map((t) => t.period));
  if (uniquePeriods.size === 1) {
    return (
      <div className="space-y-6">
        <UtilitySummaryCards totalSpend={totalSpend} summary={summary} />
        <AnalyticsFilters
          fromDate={fromDate}
          toDate={toDate}
          granularity={granularity}
          propertyIds={propertyIds}
          properties={properties}
          onFromDate={handleFromDate}
          onToDate={handleToDate}
          onGranularity={handleGranularity}
          onPropertyIds={handlePropertyIds}
          hasActiveFilters={hasActiveFilters}
          onClear={handleClearFilters}
        />
        <Card>
          <p className="text-sm text-muted-foreground text-center py-8">
            I only have one month of data — try expanding the date range to see trends.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <UtilitySummaryCards totalSpend={totalSpend} summary={summary} />
      <AnalyticsFilters
        fromDate={fromDate}
        toDate={toDate}
        granularity={granularity}
        propertyIds={propertyIds}
        properties={properties}
        onFromDate={handleFromDate}
        onToDate={handleToDate}
        onGranularity={handleGranularity}
        onPropertyIds={handlePropertyIds}
        hasActiveFilters={hasActiveFilters}
        onClear={handleClearFilters}
      />
      <Card title="Utility Spend Over Time">
        <UtilityTrendsChart trends={trends} granularity={granularity} />
      </Card>
    </div>
  );
}
