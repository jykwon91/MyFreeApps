import { useSearchParams } from "react-router-dom";
import { X } from "lucide-react";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import AlertBox from "@/shared/components/ui/AlertBox";
import UtilityTrends from "@/app/features/analytics/UtilityTrends";
import { useDismissable } from "@/shared/hooks/useDismissable";

const TABS = [
  { key: "utility-trends", label: "Utility Trends" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function Analytics() {
  const { dismissed: infoDismissed, dismiss: dismissInfo } = useDismissable("analytics-info-dismissed");
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") ?? "utility-trends") as TabKey;

  function setTab(tab: TabKey) {
    setSearchParams(
      (prev) => {
        prev.set("tab", tab);
        return prev;
      },
      { replace: true },
    );
  }

  return (
    <main className="p-4 sm:p-8 space-y-6 md:h-screen md:flex md:flex-col md:overflow-hidden">
      <SectionHeader title="Analytics" />

      {!infoDismissed && (
        <AlertBox variant="info" className="flex items-center justify-between gap-3">
          <span>
            I track your utility costs over time so you can spot seasonal patterns, catch unusual spikes, and have a clear picture of operating costs for each property.
          </span>
          <button
            onClick={dismissInfo}
            aria-label="Dismiss"
            className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-800 dark:text-blue-200 shrink-0"
          >
            <X size={14} />
          </button>
        </AlertBox>
      )}

      <div className="flex gap-1 border-b" role="tablist">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            aria-selected={activeTab === key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="md:flex-1 md:overflow-auto">
        {activeTab === "utility-trends" && <UtilityTrends />}
      </div>
    </main>
  );
}
