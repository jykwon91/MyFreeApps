import { SEGMENT_CLASS, SEGMENT_LABEL, SEGMENT_ORDER } from "@/games/wow-forever/data/serverStatus/timelineColors";

/** What the bar colours mean. */
export default function TimelineLegend() {
  return (
    <ul aria-label="Timeline colours" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {SEGMENT_ORDER.map((status) => (
        <li key={status} className="flex items-center gap-1.5">
          <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-full ${SEGMENT_CLASS[status]}`} />
          {SEGMENT_LABEL[status]}
        </li>
      ))}
    </ul>
  );
}
