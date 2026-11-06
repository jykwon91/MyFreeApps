import clsx from "clsx";
import { timeAgo } from "@platform/ui";
import { TRIAGE_VERDICT_LABEL, TRIAGE_VERDICT_STYLE } from "@/games/wow-forever/data/featureRequests/triage/triageLabels";
import { TRIAGE_CHIP } from "@/games/wow-forever/data/featureRequests/triage/triageStyles";
import { contextChips } from "@/games/wow-forever/lib/featureRequests/triage/contextChips";
import type { TriageInboxItem } from "@/games/wow-forever/types/featureRequests/triage/triageInboxItem";

interface TriageCardMetaProps {
  item: TriageInboxItem;
}

/** A card's first row: the verdict badge, how long ago, and the submitter's "about you" chips. */
export default function TriageCardMeta({ item }: TriageCardMetaProps) {
  const chips = contextChips(item.context);
  return (
    <div className="space-y-1.5" data-row="meta">
      <div className="flex flex-wrap items-center gap-2">
        <span className={clsx(TRIAGE_CHIP, TRIAGE_VERDICT_STYLE[item.verdict])}>{TRIAGE_VERDICT_LABEL[item.verdict]}</span>
        <time dateTime={item.created_at} className="text-xs text-muted-foreground">
          {timeAgo(item.created_at)}
        </time>
      </div>
      {chips.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="About the player">
          {chips.map((chip) => (
            <li key={chip} className={clsx(TRIAGE_CHIP, "font-normal text-muted-foreground")}>
              {chip}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
