import { useRef, type KeyboardEvent } from "react";
import { nextTabIndex } from "@platform/ui";
import { REPLY_TEMPLATE_MESSAGES } from "@/shared/lib/reply-template-messages";
import type { ReplyTemplatesView } from "@/shared/types/inquiry/reply-templates-view";

const TABS: ReadonlyArray<{ view: ReplyTemplatesView; label: string }> = [
  { view: "active", label: REPLY_TEMPLATE_MESSAGES.activeTab },
  { view: "archived", label: REPLY_TEMPLATE_MESSAGES.archivedTab },
];

export interface ReplyTemplatesViewTabsProps {
  view: ReplyTemplatesView;
  onChange: (next: ReplyTemplatesView) => void;
  panelId: string;
}

export default function ReplyTemplatesViewTabs({ view, onChange, panelId }: ReplyTemplatesViewTabsProps) {
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next = nextTabIndex(event.key, TABS.findIndex((tab) => tab.view === view), TABS.length);
    if (next === null) return;
    event.preventDefault();
    onChange(TABS[next].view);
    tabs.current[next]?.focus();
  }

  return (
    <div className="flex gap-2 border-b pb-2" role="tablist" onKeyDown={handleKeyDown} data-testid="reply-templates-view-tabs">
      {TABS.map((tab, index) => {
        const selected = tab.view === view;
        return (
          <button
            key={tab.view}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`reply-templates-tab-${tab.view}`}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.view)}
            data-testid={`reply-templates-tab-${tab.view}`}
            className={`px-3 min-h-[44px] text-sm rounded-md border transition-colors ${
              selected ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
