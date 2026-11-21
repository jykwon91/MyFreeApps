import { Tabs, type TabOption } from "@platform/ui";
import { REPLY_TEMPLATE_MESSAGES } from "@/shared/lib/reply-template-messages";
import type { ReplyTemplatesView } from "@/shared/types/inquiry/reply-templates-view";

export const REPLY_TEMPLATES_TABS_ID_PREFIX = "reply-templates";

const TABS: ReadonlyArray<TabOption<ReplyTemplatesView>> = [
  { value: "active", label: REPLY_TEMPLATE_MESSAGES.activeTab, testId: "reply-templates-tab-active" },
  { value: "archived", label: REPLY_TEMPLATE_MESSAGES.archivedTab, testId: "reply-templates-tab-archived" },
];

export interface ReplyTemplatesViewTabsProps {
  view: ReplyTemplatesView;
  onChange: (next: ReplyTemplatesView) => void;
}

export default function ReplyTemplatesViewTabs({ view, onChange }: ReplyTemplatesViewTabsProps) {
  return (
    <Tabs
      tabs={TABS}
      value={view}
      onChange={onChange}
      idPrefix={REPLY_TEMPLATES_TABS_ID_PREFIX}
      className="flex gap-2 border-b pb-2"
      testId="reply-templates-view-tabs"
      tabClassName={(selected) =>
        `px-3 min-h-[44px] text-sm rounded-md border transition-colors ${
          selected ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground hover:text-foreground"
        }`}
    />
  );
}
