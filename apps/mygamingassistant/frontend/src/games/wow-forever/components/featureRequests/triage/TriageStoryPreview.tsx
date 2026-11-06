import { useId, useState } from "react";
import StoryChips from "@/games/wow-forever/components/featureRequests/StoryChips";
import StoryCriteria from "@/games/wow-forever/components/featureRequests/StoryCriteria";
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import { storySentence } from "@/games/wow-forever/lib/featureRequests/featureRequestFormat";
import type { TriageStory } from "@/games/wow-forever/types/featureRequests/triage/triageStory";

interface TriageStoryPreviewProps {
  story: TriageStory;
}

/** "How I read it": the refined story — title, sentence, area / feasibility chips, criteria behind a toggle. */
export default function TriageStoryPreview({ story }: TriageStoryPreviewProps) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const hasDetails = story.acceptance_criteria.length > 0 || story.follow_ups.length > 0;
  return (
    <section className="space-y-2" aria-label={TRIAGE_COPY.howIReadIt}>
      <h3 className="text-xs font-medium text-muted-foreground">{TRIAGE_COPY.howIReadIt}</h3>
      <p className="font-semibold leading-snug [overflow-wrap:anywhere]">
        <bdi>{story.title}</bdi>
      </p>
      <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
        <bdi>{storySentence(story)}</bdi>
      </p>
      <StoryChips status={null} area={story.area} topic={story.topic} feasibility={story.feasibility} mine={false} />
      {story.feasibility_note !== null ? (
        <p className="text-sm [overflow-wrap:anywhere]">
          <bdi>{story.feasibility_note}</bdi>
        </p>
      ) : null}
      {hasDetails ? (
        <>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setOpen((o) => !o)}
            className="min-h-11 text-sm text-primary underline underline-offset-2"
          >
            {TRIAGE_COPY.whatDoneLooksLike}
          </button>
          {open ? (
            <div id={detailsId}>
              <StoryCriteria criteria={story.acceptance_criteria} followUps={story.follow_ups} />
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
