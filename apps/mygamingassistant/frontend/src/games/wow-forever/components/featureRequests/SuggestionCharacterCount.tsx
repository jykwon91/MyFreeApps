import {
  SUGGESTION_COUNTER_FROM,
  SUGGESTION_MAX_LENGTH,
} from "@/games/wow-forever/data/featureRequests/suggestCopy";

interface SuggestionCharacterCountProps {
  id: string;
  length: number;
}

/** "812 / 1000" under the idea box — only once it's getting close to the limit. Read out politely. */
export default function SuggestionCharacterCount({ id, length }: SuggestionCharacterCountProps) {
  return (
    <p id={id} aria-live="polite" className="text-right text-xs text-muted-foreground">
      {length >= SUGGESTION_COUNTER_FROM ? `${length} / ${SUGGESTION_MAX_LENGTH}` : null}
    </p>
  );
}
