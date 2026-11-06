import clsx from "clsx";
import { FEASIBILITY_CHIP, STORY_STATUS_LABEL, STORY_STATUS_STYLE } from "@/games/wow-forever/data/featureRequests/featureRequestLabels";
import { areaChipLabel } from "@/games/wow-forever/lib/featureRequests/featureRequestFormat";
import type { FeatureArea } from "@/games/wow-forever/types/featureRequests/featureArea";
import type { FeatureFeasibility } from "@/games/wow-forever/types/featureRequests/featureFeasibility";
import type { PublicStoryStatus } from "@/games/wow-forever/types/featureRequests/publicStoryStatus";

interface StoryChipsProps {
  /** Null for a story that isn't public yet (the submit result). */
  status: PublicStoryStatus | null;
  area: FeatureArea;
  topic: string | null;
  feasibility: FeatureFeasibility;
  /** "You asked" — this browser sent the idea. */
  mine: boolean;
}

const CHIP = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs";

/** A story's first row: status, area (with topic), "can't build" / "waiting on data", and "You asked". */
export default function StoryChips({ status, area, topic, feasibility, mine }: StoryChipsProps) {
  const feasibilityChip = FEASIBILITY_CHIP[feasibility];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {status !== null ? (
        <span className={clsx(CHIP, "font-medium", STORY_STATUS_STYLE[status])}>{STORY_STATUS_LABEL[status]}</span>
      ) : null}
      <span className={clsx(CHIP, "text-muted-foreground")}>{areaChipLabel(area, topic)}</span>
      {feasibilityChip !== null ? (
        <span className={clsx(CHIP, "border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-200")}>
          {feasibilityChip}
        </span>
      ) : null}
      {mine ? <span className={clsx(CHIP, "border-primary text-primary")}>You asked</span> : null}
    </div>
  );
}
