import { useDraftLinePicker } from "@myjobhunter/api-client/hooks/useDraftLinePicker";
import { useRefinementProposal } from "@myjobhunter/api-client/hooks/useRefinementProposal";
import type { PickedDraftLine } from "@myjobhunter/api-client/types/resume-refinement/picked-draft-line";
import { SuggestionMode } from "@myjobhunter/api-client/types/resume-refinement/suggestion-mode";
import { Banner, SegmentedControl, SHOWING_LAST_LOADED_MESSAGE, useToast } from "@platform/mobile";
import { useEffect, useRef, useState } from "react";
import type { ScrollViewInstance } from "react-native";
import { RESUME_MESSAGES as MESSAGES } from "../../constants/resume";
import { RESUME_PANES } from "../../constants/resumePanes";
import { RESUME_HIGHLIGHT_SCROLL_MARGIN } from "../../constants/resumeScroll";
import { refinementFailure } from "../../lib/refinementFailure";
import type { ResumePane } from "../../types/ResumePane";
import type { ResumeSessionViewProps } from "../../types/ResumeSessionViewProps";
import ResumeCompleteCard from "./ResumeCompleteCard";
import ResumeDraft from "./ResumeDraft";
import ResumePreparingCard from "./ResumePreparingCard";
import ResumeScroll from "./ResumeScroll";
import ResumeSessionHeader from "./ResumeSessionHeader";
import ResumeSuggestionCard from "./ResumeSuggestionCard";
import ResumeTranscript from "./ResumeTranscript";
import { useShareResumeExport } from "./useShareResumeExport";

/**
 * The website's two columns, one at a time: Review holds the suggestion, the finishing card and
 * the conversation; Draft holds the resume, where a tapped line gets a fresh suggestion.
 */
export default function ResumeSessionView({ session, onStartNew, isStale, renewSession }: ResumeSessionViewProps) {
  const { showToast } = useToast();
  const [pane, setPane] = useState<ResumePane>("review");
  const [customFailure, setCustomFailure] = useState<string | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);
  const draftTop = useRef(0);
  // A failure while Write my own is open shows in its sheet, where a toast would sit behind it.
  const isCustomOpen = useRef(false);

  const exports = useShareResumeExport(session.id, renewSession);
  const picker = useDraftLinePicker(session, (error) => showToast(refinementFailure(error), "error"));
  const proposal = useRefinementProposal(session, {
    onSuccess: (message) => showToast(message),
    onError: (error) => {
      const message = refinementFailure(error);
      if (isCustomOpen.current) setCustomFailure(message);
      else showToast(message, "error");
    },
    externalPending: picker.isPicking,
  });
  useEffect(() => {
    isCustomOpen.current = proposal.mode === SuggestionMode.CUSTOM;
  }, [proposal.mode]);

  const isPreparing = session.status === "preparing" || session.status === "failed";
  const showWorkSurface = session.status === "active" || session.status === "completed";

  function show(next: ResumePane): void {
    setPane(next);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  function pick(line: PickedDraftLine): void {
    // The suggestion's skeleton shows while the new one is written.
    show("review");
    void picker.pick(line);
  }

  return (
    <ResumeScroll ref={scroll} testID="resume">
      <ResumeSessionHeader label={session.status === "preparing" ? MESSAGES.cancel : MESSAGES.startDifferent} onStartNew={onStartNew} />
      {isStale ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      <SegmentedControl accessibilityLabel={MESSAGES.panesLabel} onChange={show} segments={RESUME_PANES} value={pane} />
      {pane === "review" ? (
        <>
          {isPreparing ? <ResumePreparingCard session={session} /> : null}
          {session.status === "active" ? (
            <ResumeSuggestionCard
              customFailure={customFailure}
              proposal={{
                ...proposal,
                openCustom: () => {
                  setCustomFailure(null);
                  proposal.openCustom();
                },
              }}
              session={session}
            />
          ) : null}
          {/* Not while preparing: with no targets yet, it would offer to finish before the review ran. */}
          {showWorkSurface ? <ResumeCompleteCard exports={exports} session={session} /> : null}
          <ResumeTranscript pendingEcho={proposal.pendingEcho} turns={session.turns} />
        </>
      ) : (
        <ResumeDraft
          canPick={session.status === "active"}
          highlightText={picker.highlightText}
          isPickDisabled={picker.isPicking}
          onHighlightLayout={(y) => scroll.current?.scrollTo({ y: Math.max(0, draftTop.current + y - RESUME_HIGHLIGHT_SCROLL_MARGIN), animated: true })}
          onLayout={(y) => (draftTop.current = y)}
          onPick={pick}
          source={session.current_draft}
        />
      )}
    </ResumeScroll>
  );
}
