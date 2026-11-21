import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { createSentenceChunker } from "../utils/sentenceChunker";
import { TurnRequestError } from "../errors/TurnRequestError";
import { blockForCode, isRetryableRefusal, normaliseRefusalCode } from "../utils/turnRefusal";
import { isConnectionLost } from "../utils/isConnectionLost";
import { nextUtcMidnight } from "../utils/nextUtcMidnight";
import { usageAnsweredSince } from "../utils/usageAnsweredSince";
import { usageBlock } from "../utils/usageBlock";
import { MAX_TURN_CHARS } from "../constants/turnLimits";
import { RESUMED_TURN_SILENCE_MS } from "../constants/turnRequest";
import {
  CONNECTION_LOST,
  NETWORK_ERROR,
  SESSION_CREATE_FAILED,
  SESSION_NOT_FOUND,
} from "../constants/turnFailureCodes";
import { useCreateSessionMutation } from "../store/sessionsApi";
import { useGetUsageTodayQuery, usageApiUtil } from "../store/usageApi";
import { useAtDailyReset } from "./useAtDailyReset";
import type { ScenarioState } from "../types/tutor/scenario-state";
import type { TurnStreamEvent } from "../types/tutor/turn-stream-event";
import type { TranscriptEntry } from "../types/session/transcript-entry";
import type { TurnFailure } from "../types/session/turn-failure";
import type { SessionBlock } from "../types/session/session-block";
import type { RequestPhase } from "../types/session/request-phase";
import type { PracticeSession } from "../types/session/practice-session";
import type { PracticeSessionConfig } from "../types/session/practice-session-config";
import type { StreamOutcome } from "../types/session/stream-outcome";

const EMPTY_STATE: ScenarioState = { goals_met: [], complete: false };

let entryCounter = 0;
function nextKey(): string {
  entryCounter += 1;
  return `turn-${entryCounter}`;
}

function newEntry(key: string, text: string): TranscriptEntry {
  return {
    key,
    learnerText: text,
    replyText: "",
    translation: null,
    corrections: [],
    retryPrompt: null,
    status: "pending",
    correctionsMissing: false,
  };
}

/**
 * The conversation loop's state machine (no rendering): creates the session
 * on the first turn, streams each turn, feeds finished sentences to speech,
 * attaches corrections, and turns refusals into retry / blocked states.
 * Today's usage, sized for this conversation's next turn, decides whether the learner can start a
 * turn; a daily-limit refusal stands in for it until a usage answer from after the next daily reset
 * arrives. A turn refused for the daily limit keeps the learner's words, to send after the reset;
 * one refused for the conversation's turn limit keeps them too, with no retry, as the conversation is over.
 * Shared by web and the phone: each passes its own ``streamTurn``.
 */
export function usePracticeSession(config: PracticeSessionConfig): PracticeSession {
  const { languageCode, ttsLocale, scenarioSlug, level, streamTurn, speak, stopSpeaking } = config;
  const dispatch = useDispatch();
  const [createSession] = useCreateSessionMutation();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [requestPhase, setRequestPhase] = useState<RequestPhase>("idle");
  const [failure, setFailure] = useState<TurnFailure | null>(null);
  const usage = useGetUsageTodayQuery(sessionId ?? undefined);
  // A refusal that blocks this conversation for good (ended, too long, tutor off).
  const [turnBlock, setTurnBlock] = useState<SessionBlock | null>(null);
  // When the budget a daily-limit refusal said was spent comes back (ms since the epoch). Until
  // then usage may still say a turn fits: it was read before the refusal, or budget was spent
  // elsewhere (another tab or device) after it was read.
  const [limitResetsAt, setLimitResetsAt] = useState<number | null>(null);
  const [scenarioState, setScenarioState] = useState<ScenarioState>(EMPTY_STATE);
  const sessionRef = useRef<string | null>(null);
  const inFlight = useRef(false);
  const abort = useRef<AbortController | null>(null);
  // The turn ``interrupt`` stopped, as opposed to one abandoned by unmounting.
  const interrupted = useRef<AbortController | null>(null);
  // The turn whose whole reply has arrived: the server has counted and charged it, so it isn't stopped.
  const replied = useRef<AbortController | null>(null);
  // The turn in flight when ``interrupt`` last ran: the only one ``resume`` may end.
  const parked = useRef<AbortController | null>(null);
  // The turn ``resume`` is listening to, and the timer that gives up on it once its stream has been silent too long.
  const watched = useRef<AbortController | null>(null);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The turn ``resume`` gave up on, which ends complete without its corrections.
  const gaveUp = useRef<AbortController | null>(null);

  const stopWatching = useCallback(() => {
    if (silenceTimer.current !== null) clearTimeout(silenceTimer.current);
    silenceTimer.current = null;
    watched.current = null;
  }, []);

  // (Re)starts the silence count for ``turn``: it ends once nothing more has arrived for long enough.
  const watch = useCallback(
    (turn: AbortController) => {
      stopWatching();
      watched.current = turn;
      silenceTimer.current = setTimeout(() => {
        silenceTimer.current = null;
        watched.current = null;
        if (abort.current !== turn) return;
        gaveUp.current = turn;
        turn.abort();
      }, RESUMED_TURN_SILENCE_MS);
    },
    [stopWatching],
  );

  useEffect(
    () => () => {
      stopWatching();
      abort.current?.abort();
    },
    [stopWatching],
  );

  const limitLifted = limitResetsAt !== null && usageAnsweredSince(usage, limitResetsAt);
  useEffect(() => {
    if (limitLifted) setLimitResetsAt(null);
  }, [limitLifted]);
  const limitBlock: SessionBlock | null = limitResetsAt !== null && !limitLifted ? "daily_limit" : null;
  const block = turnBlock ?? limitBlock ?? usageBlock(usage.data);
  // Nothing else asks again at the reset: refresh usage then, so a daily-limit block lifts in place.
  useAtDailyReset(block === "daily_limit", () => {
    dispatch(usageApiUtil.invalidateTags(["Usage"]));
  });

  const patchEntry = useCallback(
    (key: string, patch: (entry: TranscriptEntry) => TranscriptEntry) => {
      setEntries((all) => all.map((entry) => (entry.key === key ? patch(entry) : entry)));
    },
    [],
  );

  const removeEntry = useCallback((key: string) => {
    setEntries((all) => all.filter((entry) => entry.key !== key));
  }, []);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionRef.current) return sessionRef.current;
    const session = await createSession({
      language_code: languageCode,
      scenario_slug: scenarioSlug,
      level,
    }).unwrap();
    sessionRef.current = session.id;
    setSessionId(session.id);
    return session.id;
  }, [createSession, languageCode, scenarioSlug, level]);

  const handleRefusal = useCallback((err: unknown, text: string, key: string) => {
    const refusal = err instanceof TurnRequestError ? err : null;
    const code = refusal ? normaliseRefusalCode(refusal.status, refusal.detail) : NETWORK_ERROR;
    const blocked = blockForCode(code);
    if (blocked === "daily_limit") {
      // The learner's words stay in the transcript, unanswered, and "Try again" sends them once
      // the budget is back.
      setLimitResetsAt(nextUtcMidnight(new Date()).getTime());
      patchEntry(key, (e) => ({ ...e, status: "failed" }));
      setFailure({ code, text, retryable: true, entryKey: key });
      return;
    }
    if (blocked === "session_limit") {
      // Only reached when the limit was hit in a race the up-front check couldn't see. The words
      // stay on screen; nothing can send them in this conversation.
      patchEntry(key, (e) => ({ ...e, status: "failed" }));
      setTurnBlock(blocked);
      return;
    }
    removeEntry(key);
    if (blocked) {
      setTurnBlock(blocked);
      return;
    }
    if (code === SESSION_NOT_FOUND) {
      // The session is gone (deleted elsewhere): a retry starts a fresh one.
      sessionRef.current = null;
      setSessionId(null);
    }
    setFailure({
      code,
      text,
      retryable: isRetryableRefusal(refusal?.status ?? 0, code),
      entryKey: null,
    });
  }, [patchEntry, removeEntry]);

  const send = useCallback(
    (rawText: string) => {
      const text = rawText.trim().slice(0, MAX_TURN_CHARS);
      if (!text || inFlight.current || block) return;
      inFlight.current = true;
      stopSpeaking();
      setFailure(null);
      const key = nextKey();
      setEntries((all) => [...all, newEntry(key, text)]);
      setRequestPhase("waiting");
      const controller = new AbortController();
      abort.current = controller;

      const run = async () => {
        let id: string;
        try {
          id = await ensureSession();
        } catch {
          removeEntry(key);
          setFailure({ code: SESSION_CREATE_FAILED, text, retryable: true, entryKey: null });
          return;
        }

        const chunker = createSentenceChunker(ttsLocale);
        const outcome: StreamOutcome = { error: null, replyDone: false, correctionsArrived: false, finished: false };
        const onEvent = (event: TurnStreamEvent) => {
          // A stopped turn takes nothing more, whatever a platform's ``streamTurn`` still delivers:
          // speech stopped with it must not start again.
          if (controller.signal.aborted) return;
          switch (event.type) {
            case "reply.delta":
              setRequestPhase("replying");
              patchEntry(key, (e) => ({ ...e, replyText: e.replyText + event.text }));
              chunker.push(event.text).forEach((sentence) => speak(sentence));
              break;
            case "reply.done":
              outcome.replyDone = true;
              replied.current = controller;
              chunker.flush().forEach((sentence) => speak(sentence));
              break;
            case "corrections":
              outcome.correctionsArrived = true;
              patchEntry(key, (e) => ({
                ...e,
                corrections: event.payload.items,
                retryPrompt: event.payload.retry_prompt,
                translation: event.payload.translation,
              }));
              setScenarioState(event.payload.scenario_state);
              break;
            case "error":
              outcome.error = { code: event.code, retryable: event.retryable };
              break;
            case "done":
              outcome.finished = true;
              // A whole reply can end complete without its corrections, if the server couldn't work them out.
              patchEntry(key, (e) => ({
                ...e,
                status: event.status,
                correctionsMissing: outcome.replyDone && !outcome.correctionsArrived,
              }));
              break;
            case "turn.started":
              break;
          }
        };

        // Anything arriving on a turn waited on after a return from the background shows its connection lives.
        const onData = () => {
          if (watched.current === controller) watch(controller);
        };
        const wasInterrupted = () => interrupted.current === controller;
        try {
          await streamTurn({ sessionId: id, text, onEvent, onData, signal: controller.signal });
        } catch (err) {
          // Unmounting abandons the turn. An interrupted one ends like a dropped connection, and
          // one given up on after its reply ends complete without its corrections. A connection that
          // went quiet also ends like a dropped one, keeping what arrived.
          if (controller.signal.aborted && !wasInterrupted() && gaveUp.current !== controller) return;
          if (!controller.signal.aborted && !outcome.replyDone && !isConnectionLost(err)) {
            handleRefusal(err, text, key);
            return;
          }
        }

        if (outcome.replyDone && !outcome.finished && !outcome.error) {
          // The learner has the whole reply, and the server kept the turn: sending it again would
          // count it twice. Only its corrections can be lost, if they hadn't arrived yet.
          patchEntry(key, (e) => ({ ...e, status: "complete", correctionsMissing: !outcome.correctionsArrived }));
          return;
        }

        // A cut-off stream may leave a sentence unspoken; an interrupted one stays unspoken.
        if (!wasInterrupted()) chunker.flush().forEach((sentence) => speak(sentence));
        const failed = outcome.error ?? (outcome.finished ? null : { code: CONNECTION_LOST, retryable: true });
        if (!failed) return;
        if (!outcome.finished) patchEntry(key, (e) => ({ ...e, status: "failed" }));
        setFailure({ code: failed.code, text, retryable: failed.retryable, entryKey: key });
      };

      void run().finally(() => {
        if (watched.current === controller) stopWatching();
        inFlight.current = false;
        abort.current = null;
        setRequestPhase("idle");
        dispatch(usageApiUtil.invalidateTags(["Usage"]));
      });
    },
    [block, dispatch, ensureSession, handleRefusal, patchEntry, removeEntry, speak, stopSpeaking, stopWatching, streamTurn, ttsLocale, watch],
  );

  const retry = useCallback(() => {
    // Nothing can be sent while blocked: the failed turn and its words stay until it lifts.
    if (!failure || block) return;
    const { text, entryKey } = failure;
    if (entryKey) removeEntry(entryKey);
    setFailure(null);
    send(text);
  }, [block, failure, removeEntry, send]);

  // "Try again" is offered only when a turn can be sent.
  const shownFailure = useMemo(
    () => (failure && block && failure.retryable ? { ...failure, retryable: false } : failure),
    [block, failure],
  );

  const interrupt = useCallback(() => {
    // Away again: a turn being waited on is waited on afresh from the next ``resume``.
    stopWatching();
    parked.current = abort.current;
    if (!abort.current || replied.current === abort.current) return;
    interrupted.current = abort.current;
    abort.current.abort();
  }, [stopWatching]);

  const resume = useCallback(() => {
    const turn = parked.current;
    parked.current = null;
    if (!turn || abort.current !== turn || replied.current !== turn) return;
    watch(turn);
  }, [watch]);

  const dismissFailure = useCallback(() => setFailure(null), []);

  const dismissRetryPrompt = useCallback(
    (key: string) => patchEntry(key, (e) => ({ ...e, retryPrompt: null })),
    [patchEntry],
  );

  return {
    sessionId,
    entries,
    requestPhase,
    failure: shownFailure,
    block,
    scenarioState,
    send,
    retry,
    interrupt,
    resume,
    dismissFailure,
    dismissRetryPrompt,
  };
}
