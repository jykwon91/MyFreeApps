/**
 * The badges under a card's company: the verdict (shared label and tone) and,
 * once a card has sat in its stage long enough, a days-in-stage chip.
 * Shared by the board's cards and the phone-width list so they never drift.
 */
import { Badge } from "@platform/ui";
import type { KanbanItem } from "@myjobhunter/api-client/types/kanban/kanban-item";
import { daysInStage } from "@myjobhunter/api-client/utils/daysInStage";
import { formatDaysInStage } from "@myjobhunter/api-client/utils/formatDaysInStage";
import { formatVerdict } from "@myjobhunter/api-client/utils/formatVerdict";
import { stageAgeTone } from "@myjobhunter/api-client/utils/stageAgeTone";
import { STATUS_TONE_BADGE_COLORS } from "@/constants/statusToneBadgeColors";
import { colorForVerdict } from "./verdictBadge";

interface KanbanCardBadgesProps {
  item: KanbanItem;
  /** The clock, in ms, that stage age counts up to. */
  now: number;
}

export default function KanbanCardBadges({ item, now }: KanbanCardBadgesProps) {
  const stageDays = daysInStage(item.stage_entered_at, now);
  const ageTone = stageAgeTone(stageDays);
  const verdictLabel = formatVerdict(item.verdict);

  if (verdictLabel === null && ageTone === null) return null;

  return (
    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
      {verdictLabel ? <Badge label={verdictLabel} color={colorForVerdict(item.verdict)} /> : null}
      {ageTone !== null && stageDays !== null ? (
        <Badge label={formatDaysInStage(stageDays)} color={STATUS_TONE_BADGE_COLORS[ageTone]} />
      ) : null}
    </div>
  );
}
