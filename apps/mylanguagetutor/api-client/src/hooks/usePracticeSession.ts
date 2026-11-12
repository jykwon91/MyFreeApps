import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { createSentenceChunker } from "../utils/sentenceChunker";
import { TurnRequestError } from "../errors/TurnRequestError";
import { blockForCode, isRetryableRefusal, normaliseRefusalCode } from "../utils/turnRefusal";
import { MAX_TURN_CHARS } from "../constants/turnLimits";
import {
  CONNECTION_LOST,
  NETWORK_ERROR,
  SESSION_CREATE_FAILED,
  SESSION_NOT_FOUND,
} from "../constants/turnFailureCodes";
import { useCreateSessionMutation } from "../store/sessionsApi";
import { usageApiUtil } from "../store/usageApi";
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
  const [block, setBlock] = useState<SessionBlock | null>(null);
  const [scenarioState, setScenarioState] = useState<ScenarioState>(EMPTY_STATE);
  const sessionRef = useRef<string | null>(null);
  const inFlight = useRef(false);
  const abort = useRef<AbortController | null>(null);
  // The turn ``interrupt`` stopped, as opposed to one abandoned by unmounting.
  const interrupted = useRef<AbortController | null>(null);
  // The turn whose whole reply has arrived: the server has counted and charged it, so it isn't stopped.
  const replied = useRef<AbortController | null>(null);
  // The turn in flight when ``interrupt`` last ran: the only one ``stopWaitingForCorrections`` may end.
  const parked = useRef<AbortController | null>(null);
  // The turn ``stopWaitingForCorrections`` gave up on, which ends complete without them.
  const gaveUp = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

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

  const handleRefusal = useCallback((err: unknown, text: string) => {
    const refusal = err instanceof TurnRequestError ? err : null;
    const code = refusal ? normaliseRefusalCode(refusal.status, refusal.detail) : NETWORK_ERROR;
    const blocked = blockForCode(code);
    if (blocked) {
      setBlock(blocked);
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
  }, []);

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
        const outcome: StreamOutcome = { error: null, replyDone: false, finished: false };
        const onEvent = (event: TurnStreamEvent) => {
          switch (event.type) {
            case "reply.delta":
              setRequestPhase("replying");
              patchEntry(key, (e) => ({ ...e, replyText: e.replyText + event.text }));
              chunker.push(event.text).forEach(speak);
              break;
            case "reply.done":
              outcome.replyDone = true;
              replied.current = controller;
              chunker.flush().forEach(speak);
              break;
            case "corrections":
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
              patchEntry(key, (e) => ({ ...e, status: event.status }));
              break;
            case "turn.started":
              break;
          }
        };

        const wasInterrupted = () => interrupted.current === controller;
        try {
          await streamTurn({ sessionId: id, text, onEvent, signal: controller.signal });
        } catch (err) {
          // Unmounting abandons the turn. An interrupted one ends like a dropped connection, and
          // one given up on after its reply ends complete without its corrections.
          if (controller.signal.aborted && !wasInterrupted() && gaveUp.current !== controller) return;
          if (!controller.signal.aborted && !outcome.replyDone) {
            removeEntry(key);
            handleRefusal(err, text);
            return;
          }
        }

        if (outcome.replyDone && !outcome.finished && !outcome.error) {
          // The learner has the whole reply, and the server kept the turn: sending it again would
          // count it twice. Only its corrections are lost.
          patchEntry(key, (e) => ({ ...e, status: "complete", correctionsMissing: true }));
          return;
        }

        // A cut-off stream may leave a sentence unspoken; an interrupted one stays unspoken.
        if (!wasInterrupted()) chunker.flush().forEach(speak);
        const failed = outcome.error ?? (outcome.finished ? null : { code: CONNECTION_LOST, retryable: true });
        if (!failed) return;
        if (!outcome.finished) patchEntry(key, (e) => ({ ...e, status: "failed" }));
        setFailure({ code: failed.code, text, retryable: failed.retryable, entryKey: key });
      };

      void run().finally(() => {
        inFlight.current = false;
        abort.current = null;
        setRequestPhase("idle");
        dispatch(usageApiUtil.invalidateTags(["Usage"]));
      });
    },
    [block, dispatch, ensureSession, handleRefusal, patchEntry, removeEntry, speak, stopSpeaking, streamTurn, ttsLocale],
  );

  const retry = useCallback(() => {
    if (!failure) return;
    const { text, entryKey } = failure;
    if (entryKey) removeEntry(entryKey);
    setFailure(null);
    send(text);
  }, [failure, removeEntry, send]);

  const interrupt = useCallback(() => {
    parked.current = abort.current;
    if (!abort.current || replied.current === abort.current) return;
    interrupted.current = abort.current;
    abort.current.abort();
  }, []);

  const stopWaitingForCorrections = useCallback(() => {
    const turn = parked.current;
    parked.current = null;
    if (!turn || abort.current !== turn || replied.current !== turn) return;
    gaveUp.current = turn;
    abort.current.abort();
  }, []);

  const dismissFailure = useCallback(() => setFailure(null), []);

  const dismissRetryPrompt = useCallback(
    (key: string) => patchEntry(key, (e) => ({ ...e, retryPrompt: null })),
    [patchEntry],
  );

  return {
    sessionId,
    entries,
    requestPhase,
    failure,
    block,
    scenarioState,
    send,
    retry,
    interrupt,
    stopWaitingForCorrections,
    dismissFailure,
    dismissRetryPrompt,
  };
}
