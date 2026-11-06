import StoryCard from "@/games/wow-forever/components/featureRequests/StoryCard";
import FocusHeading from "@/games/wow-forever/components/shared/FocusHeading";
import { RESULT_PRIMARY_ACTION, RESULT_SECONDARY_ACTION } from "@/games/wow-forever/data/featureRequests/suggestStyles";
import { SUGGEST_COPY } from "@/games/wow-forever/data/featureRequests/suggestCopy";
import type { NewVerdictResponse } from "@/games/wow-forever/types/featureRequests/newVerdictResponse";

interface SuggestionNewResultProps {
  response: NewVerdictResponse;
  onLooksRight: () => void;
  onNotWhatIMeant: () => void;
}

/** A new idea, refined: "Here's how I understood it", the story with its criteria, and the two ways on. */
export default function SuggestionNewResult({ response, onLooksRight, onNotWhatIMeant }: SuggestionNewResultProps) {
  return (
    <div className="space-y-4">
      <FocusHeading>{SUGGEST_COPY.newHeading}</FocusHeading>
      <StoryCard story={response.story} status={null} mine={false} expanded />
      <p className="text-sm text-muted-foreground">{SUGGEST_COPY.newReview}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={onLooksRight} className={RESULT_PRIMARY_ACTION}>
          Looks right, thanks
        </button>
        <button type="button" onClick={onNotWhatIMeant} className={RESULT_SECONDARY_ACTION}>
          That&apos;s not what I meant
        </button>
      </div>
    </div>
  );
}
