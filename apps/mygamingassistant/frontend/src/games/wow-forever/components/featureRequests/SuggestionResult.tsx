import type { RefObject } from "react";
import SuggestionClarify from "@/games/wow-forever/components/featureRequests/SuggestionClarify";
import SuggestionDuplicateResult from "@/games/wow-forever/components/featureRequests/SuggestionDuplicateResult";
import SuggestionForm from "@/games/wow-forever/components/featureRequests/SuggestionForm";
import SuggestionNewResult from "@/games/wow-forever/components/featureRequests/SuggestionNewResult";
import type { AboutYouState } from "@/games/wow-forever/types/featureRequests/aboutYouState";
import type { SuggestionSubmitState } from "@/games/wow-forever/types/featureRequests/suggestionSubmitState";

interface SuggestionResultProps {
  submit: SuggestionSubmitState;
  aboutYou: AboutYouState;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onViewOnBoard: (storyId: string) => void;
}

/** The form card's content: the form, the clarifying question, or what came back — swapped in place. */
export default function SuggestionResult({ submit, aboutYou, textareaRef, onViewOnBoard }: SuggestionResultProps) {
  const { view } = submit;
  switch (view.view) {
    case "compose":
      return (
        <SuggestionForm
          submit={submit}
          aboutYou={aboutYou}
          failure={view.failure}
          correcting={view.correcting}
          textareaRef={textareaRef}
        />
      );
    case "clarify":
      return <SuggestionClarify submit={submit} aboutYou={aboutYou} question={view.question} failure={view.failure} />;
    case "new":
      return (
        <SuggestionNewResult response={view.response} onLooksRight={submit.startOver} onNotWhatIMeant={submit.correct} />
      );
    case "duplicate":
      return (
        <SuggestionDuplicateResult response={view.response} onViewOnBoard={onViewOnBoard} onSendAnother={submit.startOver} />
      );
  }
}
