import type { InquirySpamStatus } from "@/shared/types/inquiry/inquiry-spam-status";

/**
 * Tab filter above the inquiry inbox — Clean / All / Flagged / Spam.
 *
 * "Clean" is the default tab so the operator's primary view excludes spam by
 * default. ``null`` means "no spam filter — show everything" and corresponds
 * to the "All" tab.
 */
interface TabConfig {
  key: string;
  label: string;
  /** ``null`` means no filter; otherwise the ``spam_status`` value to query. */
  value: InquirySpamStatus | null;
}

const TABS: ReadonlyArray<TabConfig> = [
  { key: "clean", label: "Clean", value: "clean" },
  { key: "all", label: "All", value: null },
  { key: "flagged", label: "Flagged", value: "flagged" },
  { key: "spam", label: "Spam", value: "spam" },
];

interface Props {
  value: InquirySpamStatus | null;
  onChange: (next: InquirySpamStatus | null) => void;
}

export default function InquirySpamTabFilter({ value, onChange }: Props) {
  return (
    <div
      className="flex flex-wrap gap-2 border-b pb-2"
      role="tablist"
      data-testid="inquiry-spam-tabs"
    >
      {TABS.map((tab) => {
        const active =
          tab.value === value
          || (tab.value === null && value === null);
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            data-testid={`inquiry-spam-tab-${tab.key}`}
            className={`px-3 min-h-[44px] text-sm rounded-md border transition-colors ${
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
