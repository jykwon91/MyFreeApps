import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/shared/utils/currency";
import { formatTag } from "@/shared/utils/tag";
import { useGetSummaryQuery } from "@/shared/store/summaryApi";
import { useGetHealthSummaryQuery } from "@/shared/store/healthApi";
import { useGetPropertiesQuery } from "@/shared/store/propertiesApi";
import { useCurrentUser } from "@/shared/hooks/useCurrentUser";
import { useDashboardFilter } from "@/shared/hooks/useDashboardFilter";
import SummaryCard from "@/app/features/dashboard/SummaryCard";
import MonthlyAverageCard from "@/app/features/dashboard/MonthlyAverageCard";
import MonthlyChart from "@/app/features/dashboard/MonthlyChart";
import MonthlyOverviewChart from "@/app/features/dashboard/MonthlyOverviewChart";
import DashboardFilterBar from "@/app/features/dashboard/DashboardFilterBar";
import type { DrillDownFilter } from "@/shared/types/dashboard/drill-down-filter";
import type { DateRange } from "@/shared/types/dashboard/date-range";
import DrillDownPanel from "@/app/features/dashboard/DrillDownPanel";
import CategoryChart from "@/app/features/dashboard/CategoryChart";
import DashboardSkeleton from "@/app/features/dashboard/DashboardSkeleton";
import HealthBanner from "@/shared/components/HealthBanner";
import Card from "@/shared/components/ui/Card";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import PropertyPnLGrid from "@/app/features/attribution/PropertyPnLGrid";
import PnLDateRangeSelector from "@/app/features/attribution/PnLDateRangeSelector";

function getThisMonthRange(): { since: string; until: string } {
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const until = now.toISOString().slice(0, 10);
  return { since, until };
}

export default function Dashboard() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [drillDown, setDrillDown] = useState<DrillDownFilter | null>(null);
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [pnlDateRange, setPnlDateRange] = useState(getThisMonthRange);

  const { user } = useCurrentUser();
  const isAdmin = user?.role === "admin";
  const { data: healthSummary } = useGetHealthSummaryQuery(undefined, {
    pollingInterval: 60000,
    skip: !isAdmin,
  });

  const { data: properties = [] } = useGetPropertiesQuery();

  const { data: summary, isLoading } = useGetSummaryQuery(
    {
      startDate: dateRange?.startDate,
      endDate: dateRange?.endDate,
      propertyIds: selectedPropertyIds.length > 0 ? selectedPropertyIds : undefined,
    },
  );

  const {
    filterState,
    filteredSummary,
    toggleCategory,
    selectOnly,
    setPreset,
    resetCategories,
    isFiltered,
  } = useDashboardFilter(summary);

  const allPropertiesSelected = selectedPropertyIds.length === 0 || selectedPropertyIds.length === properties.length;
  const activePropertyIds = allPropertiesSelected ? undefined : selectedPropertyIds;

  const handleDrillDown = useCallback(
    (filter: DrillDownFilter) => {
      setDrillDown({ ...filter, propertyIds: activePropertyIds });
    },
    [activePropertyIds],
  );

  const handleCategoryClick = useCallback(
    (category: string) => {
      setDrillDown({
        category,
        label: formatTag(category),
        startDate: dateRange?.startDate,
        endDate: dateRange?.endDate,
        propertyIds: activePropertyIds,
      });
    },
    [dateRange, activePropertyIds],
  );

  if (isLoading)
    return (
      <div className="p-4 sm:p-8">
        <DashboardSkeleton />
      </div>
    );

  const isEmpty =
    summary &&
    summary.revenue === 0 &&
    summary.expenses === 0 &&
    summary.by_month.length === 0 &&
    summary.by_property.length === 0;

  return (
    <main className="p-4 sm:p-8 space-y-6 sm:space-y-8">
      {healthSummary && healthSummary.status !== "healthy" && (
        <HealthBanner status={healthSummary.status} />
      )}

      <SectionHeader
        title="Dashboard"
        subtitle={
          dateRange
            ? `${dateRange.startDate} — ${dateRange.endDate}`
            : healthSummary && healthSummary.status !== "healthy"
              ? (
                  <Link
                    to="/admin/system-health"
                    className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    <AlertTriangle size={14} />
                    <span>
                      {healthSummary.stats?.documents_failed ?? 0} failed
                      documents
                    </span>
                  </Link>
                )
              : undefined
        }
        actions={
          dateRange ? (
            <button
              onClick={() => setDateRange(undefined)}
              className="text-sm text-primary hover:underline font-medium"
            >
              Reset to all time
            </button>
          ) : (summary?.by_month?.length ?? 0) > 0 ? (
            <span className="text-xs text-muted-foreground">
              Drag across months to filter
            </span>
          ) : undefined
        }
      />

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          label="Total Revenue"
          amount={filteredSummary?.revenue ?? 0}
          color="text-green-600"
        />
        <SummaryCard
          label="Total Expenses"
          amount={filteredSummary?.expenses ?? 0}
          color="text-red-500"
        />
        <SummaryCard
          label="Net Profit"
          amount={filteredSummary?.profit ?? 0}
          color={
            (filteredSummary?.profit ?? 0) >= 0
              ? "text-green-600"
              : "text-red-500"
          }
        />
      </section>

      {!isEmpty && (filteredSummary?.by_month?.length ?? 0) > 0 && (
        <MonthlyAverageCard byMonth={filteredSummary?.by_month ?? []} />
      )}

      {!isEmpty && (
        <DashboardFilterBar
          filterState={filterState}
          onToggleCategory={toggleCategory}
          onSelectOnlyCategory={selectOnly}
          onSetPreset={setPreset}
          onResetCategories={resetCategories}
          isFiltered={isFiltered}
          properties={properties}
          selectedPropertyIds={selectedPropertyIds}
          onPropertyIdsChange={setSelectedPropertyIds}
        />
      )}

      {isEmpty && (
        <Card className="text-center py-12">
          <p className="text-muted-foreground mb-2">No transactions yet.</p>
          <p className="text-sm text-muted-foreground mb-4">
            Upload your first document to see your financial overview.
          </p>
          <Link
            to="/documents"
            className="inline-flex items-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
          >
            Go to Documents
          </Link>
        </Card>
      )}

      {((filteredSummary?.by_month?.length ?? 0) > 0 ||
        (filteredSummary?.by_month_expense?.length ?? 0) > 0) && (
        <Card title="Monthly Overview">
          <MonthlyOverviewChart
            byMonth={filteredSummary?.by_month ?? []}
            byMonthExpense={filteredSummary?.by_month_expense ?? []}
            byPropertyMonth={
              activePropertyIds
                ? filteredSummary?.by_property_month?.filter(
                    (p) => activePropertyIds.includes(p.property_id),
                  )
                : undefined
            }
            onBarClick={handleDrillDown}
            onRangeSelect={setDateRange}
            selectedCategories={
              isFiltered ? filterState.selectedCategories : undefined
            }
          />
        </Card>
      )}

      {(filteredSummary?.by_property?.length ?? 0) > 0 && (
        <Card className="overflow-hidden p-0">
          <h2 className="text-base font-medium px-6 py-4 border-b">
            By Property
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="text-left px-6 py-3 font-medium">Property</th>
                  <th className="text-right px-6 py-3 font-medium">Revenue</th>
                  <th className="text-right px-6 py-3 font-medium">
                    Expenses
                  </th>
                  <th className="text-right px-6 py-3 font-medium">
                    Net Profit
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(filteredSummary?.by_property ?? []).map((row) => (
                  <tr key={row.property_id} className="hover:bg-muted/40">
                    <td className="px-6 py-3 font-medium">{row.name}</td>
                    <td className="px-6 py-3 text-right text-green-600">
                      {formatCurrency(row.revenue)}
                    </td>
                    <td className="px-6 py-3 text-right text-red-500">
                      {formatCurrency(row.expenses)}
                    </td>
                    <td
                      className={`px-6 py-3 text-right font-semibold ${row.profit >= 0 ? "text-green-600" : "text-red-500"}`}
                    >
                      {formatCurrency(row.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {(filteredSummary?.by_property_month?.length ?? 0) > 0 && (
        <section className="space-y-4">
          <h2 className="text-base font-medium">Monthly by Property</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-x-hidden">
            {(filteredSummary?.by_property_month ?? [])
              .filter((prop) =>
                prop.months.some(
                  (m) => m.revenue !== 0 || m.expenses !== 0,
                ),
              )
              .map((prop) => (
                <Card key={prop.property_id}>
                  <h3 className="text-sm font-medium mb-3 text-muted-foreground">
                    {prop.name}
                  </h3>
                  <MonthlyChart
                    data={prop.months}
                    height={200}
                    onBarClick={(startDate, endDate, dataKey) => {
                      setDrillDown({
                        propertyId: prop.property_id,
                        type:
                          dataKey === "revenue" ? "revenue" : "expenses",
                        startDate,
                        endDate,
                        label: `${prop.name} — ${dataKey === "revenue" ? "Revenue" : "Expenses"}`,
                      });
                    }}
                  />
                </Card>
              ))}
          </div>
        </section>
      )}

      {filteredSummary &&
        Object.keys(filteredSummary.by_category).length > 0 && (
          <Card title="By Category">
            <CategoryChart
              byCategory={filteredSummary.by_category}
              onBarClick={handleCategoryClick}
            />
          </Card>
        )}

      {/* Property P&L section */}
      <section className="space-y-4" data-testid="property-pnl-section">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <h2 className="text-base font-medium">Property P&L</h2>
          <PnLDateRangeSelector value={pnlDateRange} onChange={setPnlDateRange} />
        </div>
        <PropertyPnLGrid since={pnlDateRange.since} until={pnlDateRange.until} />
      </section>

      {drillDown && (
        <DrillDownPanel
          filter={drillDown}
          onClose={() => setDrillDown(null)}
        />
      )}
    </main>
  );
}
