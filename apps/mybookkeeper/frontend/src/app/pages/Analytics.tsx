import { AlertBox, useLiveSearchParams, Tabs, TabPanel, useDismissable, DismissButton } from "@platform/ui";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import RentalRoi from "@/app/features/analytics/RentalRoi";
import UtilityTrends from "@/app/features/analytics/UtilityTrends";
import { ANALYTICS_TABS, DEFAULT_ANALYTICS_TAB } from "@/shared/lib/analytics-tabs";
import type { AnalyticsTabKey } from "@/shared/types/analytics/analytics-tab-key";
import { isAnalyticsTabKey } from "@/shared/utils/is-analytics-tab-key";

export default function Analytics() {
  const { dismissed: infoDismissed, dismiss: dismissInfo } = useDismissable("analytics-info-dismissed");
  const [searchParams, setSearchParams] = useLiveSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: AnalyticsTabKey = isAnalyticsTabKey(tabParam) ? tabParam : DEFAULT_ANALYTICS_TAB;

  function setTab(tab: AnalyticsTabKey) {
    setSearchParams(
      (prev) => {
        prev.set("tab", tab);
        return prev;
      },
      { replace: true },
    );
  }

  return (
    <div className="p-4 sm:p-8 space-y-6 md:h-screen md:flex md:flex-col md:overflow-hidden">
      <SectionHeader title="Analytics" />

      {activeTab === "utility-trends" && !infoDismissed && (
        <AlertBox variant="info" className="flex items-center justify-between gap-3">
          <span>
            I track your utility costs over time so you can spot seasonal patterns, catch unusual spikes, and have a clear picture of operating costs for each property.
          </span>
          <DismissButton onClick={dismissInfo} />
        </AlertBox>
      )}

      <Tabs
        tabs={ANALYTICS_TABS.map(({ key, label }) => ({ value: key, label }))}
        value={activeTab}
        onChange={setTab}
        idPrefix="analytics"
        className="flex gap-1 border-b"
        tabClassName={(selected) =>
          `px-4 py-2 min-h-[44px] text-sm font-medium border-b-2 transition-colors ${
            selected
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
      />

      <TabPanel idPrefix="analytics" value={activeTab} className="md:flex-1 md:overflow-auto">
        {activeTab === "rental-roi" && <RentalRoi />}
        {activeTab === "utility-trends" && <UtilityTrends />}
      </TabPanel>
    </div>
  );
}
