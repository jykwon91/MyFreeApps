import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { showSuccess } from "@platform/ui";
import { invalidateFeatureRequests, submitFeatureRequest } from "@/games/wow-forever/api/wowFeatureRequestsApi";
import { SUBMIT_PROBLEM, SUGGEST_COPY, SUGGESTION_MIN_LENGTH } from "@/games/wow-forever/data/featureRequests/suggestCopy";
import { answerBody, ideaBody } from "@/games/wow-forever/lib/featureRequests/submissionBody";
import { submitFailureFrom } from "@/games/wow-forever/lib/featureRequests/submitFailure";
import {
  clearSuggestionDraft,
  readSuggestionDraft,
  writeSuggestionDraft,
} from "@/games/wow-forever/lib/featureRequests/suggestionDraft";
import { useTurnstileToken } from "@/games/wow-forever/hooks/useTurnstileToken";
import type { AppDispatch } from "@/lib/store";
import type { SubmissionContext } from "@/games/wow-forever/types/featureRequests/submissionContext";
import type { SubmitFailure } from "@/games/wow-forever/types/featureRequests/submitFailure";
import type { SubmitFeatureRequestBody } from "@/games/wow-forever/types/featureRequests/submitFeatureRequestBody";
import type { SubmitFeatureRequestResponse } from "@/games/wow-forever/types/featureRequests/submitFeatureRequestResponse";
import type { SuggestionSubmitState } from "@/games/wow-forever/types/featureRequests/suggestionSubmitState";
import type { SuggestionView } from "@/games/wow-forever/types/featureRequests/suggestionView";

const COMPOSE: SuggestionView = { view: "compose", failure: null, correcting: false };
const MS_PER_SECOND = 1000;

/** The card after a failed send: the clarify step keeps its question; anything else is the form. */
function withFailure(prev: SuggestionView, failure: SubmitFailure): SuggestionView {
  if (prev.view === "clarify") return { ...prev, failure };
  return { view: "compose", failure, correcting: prev.view === "compose" && prev.correcting };
}

/**
 * The "Suggest a feature" form: the draft (kept in sessionStorage), the send — with its single-use
 * Turnstile token, Cancel and the 30 s timeout — and which result or problem the card shows.
 */
export function useSuggestionSubmit(
  clientId: string,
  onNewStory: (id: string, title: string) => void,
): SuggestionSubmitState {
  const dispatch = useDispatch<AppDispatch>();
  const turnstile = useTurnstileToken();
  const { token, reset: resetTurnstile } = turnstile;
  const [text, setTextState] = useState(readSuggestionDraft);
  const [view, setView] = useState<SuggestionView>(COMPOSE);
  const [submittingSince, setSubmittingSince] = useState<number | null>(null);
  const [blockedUntil, setBlockedUntil] = useState<number | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  // Leaving the page mid-send drops the request.
  useEffect(() => () => controllerRef.current?.abort(), []);

  const setText = useCallback((next: string) => {
    setTextState(next);
    writeSuggestionDraft(next);
  }, []);

  const handleResponse = useCallback(
    (response: SubmitFeatureRequestResponse) => {
      switch (response.verdict) {
        case "new":
          clearSuggestionDraft();
          onNewStory(response.story.id, response.story.title);
          showSuccess(SUGGEST_COPY.newThanksToast);
          setView({ view: "new", response });
          return;
        case "duplicate":
          clearSuggestionDraft();
          // The server counted this idea as a vote — the board's numbers moved.
          dispatch(invalidateFeatureRequests());
          setView({ view: "duplicate", response });
          return;
        case "needs_clarification":
          setView({ view: "clarify", submissionId: response.submission_id, question: response.question, failure: null });
          return;
        case "rejected":
          setView({ view: "compose", failure: { kind: SUBMIT_PROBLEM.rejected, retryAfterSeconds: null }, correcting: false });
          return;
      }
    },
    [dispatch, onNewStory],
  );

  const post = useCallback(
    async (body: SubmitFeatureRequestBody) => {
      const controller = new AbortController();
      controllerRef.current = controller;
      setSubmittingSince(Date.now());
      try {
        handleResponse(await submitFeatureRequest(body, token, controller.signal));
      } catch (err) {
        // Cancelled: back to the card as it was, nothing to report.
        if (!controller.signal.aborted) {
          const failure = submitFailureFrom(err);
          if (failure.retryAfterSeconds !== null) {
            setBlockedUntil(Date.now() + failure.retryAfterSeconds * MS_PER_SECOND);
          }
          setView((prev) => withFailure(prev, failure));
        }
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
        setSubmittingSince(null);
        // The token reached (or may have reached) the server: it's spent either way.
        resetTurnstile();
      }
    },
    [handleResponse, token, resetTurnstile],
  );

  const send = useCallback(
    (context: SubmissionContext) => {
      if (text.trim().length < SUGGESTION_MIN_LENGTH) {
        setView({ view: "compose", failure: { kind: SUBMIT_PROBLEM.tooShort, retryAfterSeconds: null }, correcting: false });
        return;
      }
      void post(ideaBody(text, clientId, context));
    },
    [text, clientId, post],
  );

  const answer = useCallback(
    (reply: string, context: SubmissionContext) => {
      if (view.view !== "clarify") return;
      void post(answerBody(text, clientId, context, view.submissionId, reply));
    },
    [view, text, clientId, post],
  );

  const cancel = useCallback(() => controllerRef.current?.abort(), []);

  const startOver = useCallback(() => {
    setText("");
    setView(COMPOSE);
  }, [setText]);

  const correct = useCallback(() => {
    writeSuggestionDraft(text);
    setView({ view: "compose", failure: null, correcting: true });
  }, [text]);

  return { text, setText, view, submittingSince, blockedUntil, turnstile, send, answer, cancel, startOver, correct };
}
