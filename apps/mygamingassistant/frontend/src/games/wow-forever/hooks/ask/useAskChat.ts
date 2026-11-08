import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sendChatTurn } from "@/games/wow-forever/api/wowChatApi";
import { ASK_FAILURE } from "@/games/wow-forever/data/ask/askFailureKinds";
import { ASK_LIMITS } from "@/games/wow-forever/data/ask/askLimits";
import { ASK_PHASE } from "@/games/wow-forever/data/ask/askPhases";
import { useAskHistory } from "@/games/wow-forever/hooks/ask/useAskHistory";
import { askFailureFrom } from "@/games/wow-forever/lib/ask/askFailure";
import { completeTurnsOnly, EMPTY_CHAT } from "@/games/wow-forever/lib/ask/askStorage";
import { stepLine } from "@/games/wow-forever/lib/ask/askStepLine";
import { buildTurns, isChatFull } from "@/games/wow-forever/lib/ask/askThread";
import { runAskTurn } from "@/games/wow-forever/lib/ask/askTurnLoop";
import { runAskTool } from "@/games/wow-forever/lib/ask/runAskTool";
import type { AskCard } from "@/games/wow-forever/types/ask/askCard";
import type { AskChatState } from "@/games/wow-forever/types/ask/askChatState";
import type { AskFailure } from "@/games/wow-forever/types/ask/askFailure";
import type { AskPhase } from "@/games/wow-forever/types/ask/askPhase";
import type { AskStoredChat } from "@/games/wow-forever/types/ask/askStoredChat";
import type { AskToolData } from "@/games/wow-forever/types/ask/askToolData";
import type { AskTurnResult } from "@/games/wow-forever/types/ask/askTurnResult";
import type { AskTurnstileState } from "@/games/wow-forever/types/ask/askTurnstileState";

/**
 * The chat: asks a question through the turn loop, tracks what's happening
 * (human check → thinking → running tools), and handles Cancel, failures
 * (the conversation goes back to before the question, which Retry asks
 * again), "New chat" with Undo, and the per-chat limits.
 */
export function useAskChat(data: AskToolData | null, turnstile: AskTurnstileState): AskChatState {
  const [chat, setChat] = useAskHistory();
  const [phase, setPhase] = useState<AskPhase>(ASK_PHASE.idle);
  const [busySince, setBusySince] = useState<number | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [failure, setFailure] = useState<AskFailure | null>(null);
  const [failedQuestion, setFailedQuestion] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [undoChat, setUndoChat] = useState<AskStoredChat | null>(null);

  // Latest values for the async question flow, which outlives the render that started it.
  const chatRef = useRef(chat);
  const dataRef = useRef(data);
  useEffect(() => {
    chatRef.current = chat;
    dataRef.current = data;
  }, [chat, data]);
  const controllerRef = useRef<AbortController | null>(null);
  const { takeToken } = turnstile;

  useEffect(() => () => controllerRef.current?.abort(), []);

  useEffect(() => {
    if (undoChat === null) return;
    const timer = window.setTimeout(() => setUndoChat(null), ASK_LIMITS.undoMs);
    return () => window.clearTimeout(timer);
  }, [undoChat]);

  const finish = useCallback(() => {
    controllerRef.current = null;
    setPhase(ASK_PHASE.idle);
    setBusySince(null);
    setSteps([]);
  }, []);

  const ask = useCallback(
    (raw: string) => {
      const question = raw.trim();
      const tools = dataRef.current;
      const before = chatRef.current;
      if (question === "" || controllerRef.current !== null || tools === null || isChatFull(before.messages)) return;

      const controller = new AbortController();
      controllerRef.current = controller;
      const cards: Record<string, AskCard> = { ...before.cards };
      setUndoChat(null);
      setFailure(null);
      setFailedQuestion(null);
      setDraft("");
      setSteps([]);
      setBusySince(Date.now());
      setPhase(ASK_PHASE.checking);
      setChat({ ...before, messages: [...before.messages], cards });

      const run = async (): Promise<AskTurnResult> => {
        const token = await takeToken(controller.signal);
        return runAskTurn(
          before.messages,
          before.ticket,
          question,
          {
            send: (body, isNewMessage) => {
              setPhase(ASK_PHASE.thinking);
              return sendChatTurn(body, isNewMessage ? token : "", controller.signal);
            },
            runTool: (call) => runAskTool(call, tools),
          },
          {
            onMessages: (messages) => setChat({ messages, cards: { ...cards }, ticket: before.ticket }),
            onCard: (id, card) => {
              cards[id] = card;
            },
            onToolCalls: (calls) => {
              setPhase(ASK_PHASE.tools);
              setSteps((prev) => [...prev, ...calls.map(stepLine)]);
            },
          },
        );
      };

      run()
        .then(({ messages, ticket }) => {
          if (controllerRef.current !== controller) return;
          setChat({ messages, cards: { ...cards }, ticket });
          finish();
        })
        .catch((err: unknown) => {
          // A newer question or "New chat" took over: leave the chat alone.
          if (controllerRef.current !== controller) return;
          setChat(before);
          if (controller.signal.aborted) {
            setDraft(question);
          } else {
            const next = askFailureFrom(err);
            setFailure(next);
            setFailedQuestion(question);
            // Too long can't be retried as is: put it back in the box to shorten.
            if (next.kind === ASK_FAILURE.tooLong) setDraft(question);
          }
          finish();
        });
    },
    [finish, setChat, takeToken],
  );

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const retry = useCallback(() => {
    if (failedQuestion !== null) ask(failedQuestion);
  }, [ask, failedQuestion]);

  const newChat = useCallback(() => {
    const running = controllerRef.current;
    controllerRef.current = null;
    running?.abort();
    finish();
    const current = chatRef.current;
    const kept = completeTurnsOnly(current.messages);
    setUndoChat(kept.length ? { messages: kept, cards: current.cards, ticket: current.ticket } : null);
    setChat(EMPTY_CHAT);
    setFailure(null);
    setFailedQuestion(null);
  }, [finish, setChat]);

  const undoNewChat = useCallback(() => {
    if (undoChat === null || controllerRef.current !== null) return;
    setChat(undoChat);
    setUndoChat(null);
  }, [setChat, undoChat]);

  const answering = phase !== ASK_PHASE.idle;
  const turns = useMemo(() => buildTurns(chat.messages, chat.cards, answering), [chat, answering]);

  return {
    turns,
    phase,
    busySince,
    steps,
    failure,
    failedQuestion,
    draft,
    setDraft,
    full: !answering && isChatFull(chat.messages),
    canUndo: undoChat !== null,
    ask,
    retry,
    cancel,
    newChat,
    undoNewChat,
  };
}
