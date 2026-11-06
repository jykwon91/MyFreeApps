import { useId, useState, type ReactNode } from "react";
import clsx from "clsx";
import StoryChips from "@/games/wow-forever/components/featureRequests/StoryChips";
import StoryCriteria from "@/games/wow-forever/components/featureRequests/StoryCriteria";
import { FEASIBILITY_CHIP } from "@/games/wow-forever/data/featureRequests/featureRequestLabels";
import { storySentence } from "@/games/wow-forever/lib/featureRequests/featureRequestFormat";
import type { PublicStoryStatus } from "@/games/wow-forever/types/featureRequests/publicStoryStatus";
import type { StoryText } from "@/games/wow-forever/types/featureRequests/storyText";

interface StoryCardProps {
  story: StoryText;
  /** Null for a story that isn't public yet. */
  status: PublicStoryStatus | null;
  mine: boolean;
  /** Show the criteria straight away (the submit result) instead of behind "Show more" (the board). */
  expanded: boolean;
  /** Board extras on the card face: the operator's note, the shipped link, the count and "Me too". */
  children?: ReactNode;
  highlighted?: boolean;
}

/**
 * One refined user story: chips, title, "As a…, I want…, so that…", the feasibility note when it can't be
 * built as asked, and its acceptance criteria. Used by the submit result and every board card.
 */
export default function StoryCard({ story, status, mine, expanded, children, highlighted = false }: StoryCardProps) {
  const [open, setOpen] = useState(expanded);
  const detailsId = useId();
  const hasDetails = story.acceptance_criteria.length > 0 || story.follow_ups.length > 0;
  const showFeasibilityNote = FEASIBILITY_CHIP[story.feasibility] !== null && story.feasibility_note !== null;

  return (
    <article
      data-story-id={story.id}
      className={clsx(
        "space-y-2 rounded-xl border bg-card p-4 scroll-mt-4",
        highlighted && "ring-2 ring-primary",
      )}
    >
      <div data-row="chips">
        <StoryChips
          status={status}
          area={story.area}
          topic={story.topic}
          feasibility={story.feasibility}
          mine={mine}
        />
      </div>
      <h3 data-row="title" className="font-semibold leading-snug line-clamp-2">{story.title}</h3>
      <p data-row="story" className={clsx("text-sm text-muted-foreground", !open && "line-clamp-3")}>{storySentence(story)}</p>
      {showFeasibilityNote ? <p className="text-sm">{story.feasibility_note}</p> : null}
      {open && hasDetails ? (
        <div id={detailsId}>
          <StoryCriteria criteria={story.acceptance_criteria} followUps={story.follow_ups} />
        </div>
      ) : null}
      {!expanded && hasDetails ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((o) => !o)}
          className="min-h-[44px] text-sm text-primary underline underline-offset-2"
        >
          {open ? "Show less" : "Show more"}
        </button>
      ) : null}
      {children}
    </article>
  );
}
