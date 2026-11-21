import type { TabOption } from "@platform/ui";
import type { ReplyTab } from "@/shared/types/inquiry/reply-tab";

/** The reply panel's two ways to write a reply. */
export const REPLY_TAB = { TEMPLATE: "template", CUSTOM: "custom" } as const;

export const REPLY_TAB_OPTIONS: ReadonlyArray<TabOption<ReplyTab>> = [
  { value: REPLY_TAB.TEMPLATE, label: "Use template", testId: "reply-tab-template" },
  { value: REPLY_TAB.CUSTOM, label: "Write custom", testId: "reply-tab-custom" },
];
