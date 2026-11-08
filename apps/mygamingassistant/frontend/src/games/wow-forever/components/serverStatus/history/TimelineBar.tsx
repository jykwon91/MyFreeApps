import { SEGMENT_CLASS } from "@/games/wow-forever/data/serverStatus/timelineColors";
import type { TimelineSegment } from "@/games/wow-forever/types/serverStatus/timelineSegment";

interface TimelineBarProps {
  segments: readonly TimelineSegment[];
  start: number;
  end: number;
  /** Read out instead of the bar, e.g. "Normal: up 99.8% of the last 24 hours". */
  label: string;
}

/** One ruleset's status over the span, oldest on the left: green up, red down, grey no data. */
export default function TimelineBar({ segments, start, end, label }: TimelineBarProps) {
  const span = end - start;
  return (
    <div role="img" aria-label={label} className="relative flex h-3 w-full overflow-hidden rounded-full bg-muted">
      {segments.map((s) => (
        <span
          key={s.start}
          data-status={s.status}
          className={`h-full ${SEGMENT_CLASS[s.status]}`}
          style={{ width: `${((s.end - s.start) / span) * 100}%` }}
        />
      ))}
    </div>
  );
}
