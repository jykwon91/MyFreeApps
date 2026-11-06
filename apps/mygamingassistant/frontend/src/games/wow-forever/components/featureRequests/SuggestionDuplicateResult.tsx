import StoryCard from "@/games/wow-forever/components/featureRequests/StoryCard";
import FocusHeading from "@/games/wow-forever/components/shared/FocusHeading";
import { RESULT_PRIMARY_ACTION, RESULT_SECONDARY_ACTION } from "@/games/wow-forever/data/featureRequests/suggestStyles";
import { SUGGEST_COPY } from "@/games/wow-forever/data/featureRequests/suggestCopy";
import { playersAskedLabel } from "@/games/wow-forever/lib/featureRequests/featureRequestFormat";
import type { DuplicateVerdictResponse } from "@/games/wow-forever/types/featureRequests/duplicateVerdictResponse";

interface SuggestionDuplicateResultProps {
  response: DuplicateVerdictResponse;
  onViewOnBoard: (storyId: string) => void;
  onSendAnother: () => void;
}

/** Already asked: the existing story with its new count, "View on board", and what this idea added. No "Me too" — it counted. */
export default function SuggestionDuplicateResult({ response, onViewOnBoard, onSendAnother }: SuggestionDuplicateResultProps) {
  const { story, nuance_note: nuanceNote } = response;
  return (
    <div className="space-y-4">
      <FocusHeading>{response.voted ? SUGGEST_COPY.duplicateHeading : SUGGEST_COPY.duplicateNoVoteHeading}</FocusHeading>
      <StoryCard story={story} status={story.status} mine expanded={false}>
        <p data-row="votes" className="pt-1 text-sm text-muted-foreground">
          {playersAskedLabel(story.vote_count)}
        </p>
      </StoryCard>
      {nuanceNote !== null ? (
        <p className="text-sm">
          <span className="font-medium">I also noted: </span>
          {nuanceNote}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={() => onViewOnBoard(story.id)} className={RESULT_PRIMARY_ACTION}>
          View on board
        </button>
        <button type="button" onClick={onSendAnother} className={RESULT_SECONDARY_ACTION}>
          Send another idea
        </button>
      </div>
    </div>
  );
}
