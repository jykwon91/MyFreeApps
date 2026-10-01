import clsx from "clsx";
import GoldConfidenceChip from "@/games/wow-forever/components/gold/GoldConfidenceChip";
import type { GoldTip } from "@/games/wow-forever/data/gold/goldTypes";

interface GoldTipListProps {
  tips: readonly GoldTip[];
  /** Numbered cards for a "do these first" list; plain rows otherwise. */
  numbered?: boolean;
}

export default function GoldTipList({ tips, numbered = false }: GoldTipListProps) {
  const List = numbered ? "ol" : "ul";
  return (
    <List className={clsx("space-y-2", numbered && "list-none")}>
      {tips.map((tip, i) => (
        <li key={tip.id} className="flex items-start gap-3 rounded-lg border bg-card p-3">
          {numbered ? (
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
              aria-hidden
            >
              {i + 1}
            </span>
          ) : null}
          <div className="space-y-0.5 min-w-0">
            <p className="text-sm font-medium">
              {tip.title} <GoldConfidenceChip confidence={tip.confidence} />
            </p>
            <p className="text-sm text-muted-foreground">{tip.detail}</p>
          </div>
        </li>
      ))}
    </List>
  );
}
