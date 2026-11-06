import { useCallback, useRef, useState } from "react";
import FeatureRequestBoard from "@/games/wow-forever/components/featureRequests/FeatureRequestBoard";
import MyPendingIdeas from "@/games/wow-forever/components/featureRequests/MyPendingIdeas";
import SuggestionPanel from "@/games/wow-forever/components/featureRequests/SuggestionPanel";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { DEFAULT_BOARD_STATUS } from "@/games/wow-forever/data/featureRequests/featureRequestBoard";
import { SUGGEST_COPY } from "@/games/wow-forever/data/featureRequests/suggestCopy";
import { useAboutYou } from "@/games/wow-forever/hooks/featureRequests/useAboutYou";
import { useBoardFilters } from "@/games/wow-forever/hooks/featureRequests/useBoardFilters";
import { useFeatureBoard } from "@/games/wow-forever/hooks/featureRequests/useFeatureBoard";
import { useHighlightedStory } from "@/games/wow-forever/hooks/featureRequests/useHighlightedStory";
import { useMeToo } from "@/games/wow-forever/hooks/featureRequests/useMeToo";
import { useMyIdeas } from "@/games/wow-forever/hooks/featureRequests/useMyIdeas";
import { useSuggestionSubmit } from "@/games/wow-forever/hooks/featureRequests/useSuggestionSubmit";
import { getVoterId } from "@/games/wow-forever/lib/featureRequests/voterId";

/**
 * /wow-forever/suggest — tell me what's missing. The form comes first; the public board below shows what
 * others asked for (and takes a "Me too"), so a player can see whether their idea is already there.
 */
export default function WowSuggestPage() {
  const [clientId] = useState(getVoterId);
  const [filters, updateFilters] = useBoardFilters();
  const board = useFeatureBoard(filters, clientId);
  const myIdeas = useMyIdeas(board.stories);
  const submit = useSuggestionSubmit(clientId, myIdeas.add);
  const aboutYou = useAboutYou();
  const meToo = useMeToo(board, clientId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const highlightStory = useCallback((storyId: string) => updateFilters({ highlight: storyId }), [updateFilters]);
  const followMerge = useCallback(
    (storyId: string) => updateFilters({ highlight: storyId }, { replace: true }),
    [updateFilters],
  );
  const pinned = useHighlightedStory(filters.highlight, board.stories, !board.isLoading, followMerge);

  const writeIdea = useCallback(() => {
    if (submit.view.view !== "compose") submit.startOver();
    // After a result the box remounts on the next render.
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  }, [submit]);

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <WowPageHeader
        title={SUGGEST_COPY.title}
        subtitle={SUGGEST_COPY.subtitle}
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      <SuggestionPanel submit={submit} aboutYou={aboutYou} textareaRef={textareaRef} onViewOnBoard={highlightStory} />
      <MyPendingIdeas ideas={myIdeas.pending} />
      <FeatureRequestBoard
        board={board}
        filters={filters}
        onFiltersChange={updateFilters}
        onClearFilters={() => updateFilters({ status: DEFAULT_BOARD_STATUS, area: null })}
        meToo={meToo}
        mine={myIdeas.mine}
        pinned={pinned}
        onWriteIdea={writeIdea}
      />
    </main>
  );
}
