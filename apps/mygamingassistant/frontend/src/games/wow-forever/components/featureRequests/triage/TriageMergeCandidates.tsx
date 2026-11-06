import clsx from "clsx";
import { TRIAGE_STATUS_LABEL, TRIAGE_STATUS_STYLE } from "@/games/wow-forever/data/featureRequests/triage/triageLabels";
import { TRIAGE_CHIP } from "@/games/wow-forever/data/featureRequests/triage/triageStyles";
import { playersAskedLabel } from "@/games/wow-forever/lib/featureRequests/featureRequestFormat";
import type { TriageStory } from "@/games/wow-forever/types/featureRequests/triage/triageStory";

interface TriageMergeCandidatesProps {
  heading: string;
  stories: readonly TriageStory[];
  onPick: (story: TriageStory) => void;
}

/** A list of merge targets: title, status and "N players asked", each a 56 px tap target. */
export default function TriageMergeCandidates({ heading, stories, onPick }: TriageMergeCandidatesProps) {
  if (stories.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{heading}</h3>
      <ul className="space-y-1.5">
        {stories.map((story) => (
          <li key={story.id}>
            <button
              type="button"
              onClick={() => onPick(story)}
              className="block min-h-14 w-full space-y-1 rounded-md border p-3 text-left hover:bg-muted"
            >
              <span className="block font-medium [overflow-wrap:anywhere]">
                <bdi>{story.title}</bdi>
              </span>
              <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className={clsx(TRIAGE_CHIP, TRIAGE_STATUS_STYLE[story.status])}>{TRIAGE_STATUS_LABEL[story.status]}</span>
                {playersAskedLabel(story.vote_count)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
