import { PROPERTY_SPLIT_LABELS as L } from "@mybookkeeper/api-client/constants/propertySplitLabels";

export interface SplitWaysBadgeProps {
  ways: number;
  /** The property names and shares, read on hover and by screen readers. */
  detail?: string;
}

/** "Split 3 ways": a transaction shared by several properties, in place of one property's name. */
export default function SplitWaysBadge({ ways, detail }: SplitWaysBadgeProps) {
  return (
    <span
      className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground whitespace-nowrap"
      title={detail}
      aria-label={detail ? `${L.splitWays(ways)}: ${detail}` : undefined}
      data-testid="split-ways-badge"
    >
      {L.splitWays(ways)}
    </span>
  );
}
