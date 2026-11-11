import { formatVerdict } from "@myjobhunter/api-client/utils/formatVerdict";
import type { KanbanItem } from "@myjobhunter/api-client/types/kanban/kanban-item";
import { DASHBOARD_MESSAGES as MESSAGES } from "../constants/dashboard";

/** "1 application" or "4 applications". */
export function applicationCount(count: number): string {
  return `${count} ${count === 1 ? MESSAGES.application : MESSAGES.applications}`;
}

/** "15 days in stage", spelled out for a screen reader. */
export function daysInStageSpoken(days: number): string {
  return `${days} ${days === 1 ? MESSAGES.dayInStage : MESSAGES.daysInStage}`;
}

/** Everything the card shows, in the order it shows it, for a screen reader. */
export function boardCardLabel(item: KanbanItem, stageDays: number | null): string {
  return [item.role_title, item.company_name, formatVerdict(item.verdict), stageDays === null ? null : daysInStageSpoken(stageDays)]
    .filter((part): part is string => Boolean(part))
    .join(", ");
}

/** What the Move button moves, so a screen reader can tell the cards' buttons apart. */
export function moveButtonLabel(item: KanbanItem): string {
  return `${MESSAGES.move} ${item.role_title}, ${item.company_name}`;
}
