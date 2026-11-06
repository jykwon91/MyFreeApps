import type { RefObject } from "react";
import { AlertBox } from "@platform/ui";
import OpenInBrowserButton from "@/components/discord/OpenInBrowserButton";
import SuggestionResult from "@/games/wow-forever/components/featureRequests/SuggestionResult";
import { SUGGEST_COPY } from "@/games/wow-forever/data/featureRequests/suggestCopy";
import {
  isHumanCheckedFeatureBrowserOnly,
  isHumanCheckedFeatureOffered,
} from "@/games/wow-forever/lib/humanCheckAvailability";
import type { AboutYouState } from "@/games/wow-forever/types/featureRequests/aboutYouState";
import type { SuggestionSubmitState } from "@/games/wow-forever/types/featureRequests/suggestionSubmitState";

interface SuggestionPanelProps {
  submit: SuggestionSubmitState;
  aboutYou: AboutYouState;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onViewOnBoard: (storyId: string) => void;
}

/**
 * The form card — or, where sending can't work (no human check configured on this build, or inside the
 * Discord Activity, which can't show it), why not. The board and "Me too" below work either way.
 */
export default function SuggestionPanel({ submit, aboutYou, textareaRef, onViewOnBoard }: SuggestionPanelProps) {
  if (!isHumanCheckedFeatureOffered()) {
    return <AlertBox variant="info">{SUGGEST_COPY.disabled}</AlertBox>;
  }
  if (isHumanCheckedFeatureBrowserOnly()) {
    return (
      <AlertBox variant="info">
        <div className="space-y-2">
          <p>{SUGGEST_COPY.browserOnly}</p>
          <OpenInBrowserButton />
        </div>
      </AlertBox>
    );
  }
  return (
    <section aria-label={SUGGEST_COPY.title} className="rounded-xl border bg-card p-4 sm:p-6">
      <SuggestionResult submit={submit} aboutYou={aboutYou} textareaRef={textareaRef} onViewOnBoard={onViewOnBoard} />
    </section>
  );
}
