import { useEffect, useRef } from "react";
import { AlertBox } from "@platform/ui";
import AskComposer from "@/games/wow-forever/components/ask/AskComposer";
import AskEmptyState from "@/games/wow-forever/components/ask/AskEmptyState";
import AskErrorNotice from "@/games/wow-forever/components/ask/AskErrorNotice";
import AskLocationChip from "@/games/wow-forever/components/ask/AskLocationChip";
import AskThread from "@/games/wow-forever/components/ask/AskThread";
import NewChatBar from "@/games/wow-forever/components/ask/NewChatBar";
import TurnstileField from "@/games/wow-forever/components/shared/TurnstileField";
import { CHAT_TURNSTILE_ACTION } from "@/games/wow-forever/data/ask/askChatWire";
import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import { ASK_PHASE } from "@/games/wow-forever/data/ask/askPhases";
import { useAskChat } from "@/games/wow-forever/hooks/ask/useAskChat";
import { useAskTurnstile } from "@/games/wow-forever/hooks/ask/useAskTurnstile";
import type { AskToolDataState } from "@/games/wow-forever/types/ask/askToolDataState";

interface AskChatProps {
  tools: AskToolDataState;
  /** A question handed over by the hub's ask box: sent once. */
  initialQuestion: string | null;
}

/** The chat once its data has loaded: location, thread (or examples), notices, the question box and the human check. */
export default function AskChat({ tools, initialQuestion }: AskChatProps) {
  const turnstile = useAskTurnstile();
  const chat = useAskChat(tools.data, turnstile);
  const busy = chat.phase !== ASK_PHASE.idle;
  const { widget } = turnstile;
  const sentInitial = useRef(false);
  const { ask } = chat;

  useEffect(() => {
    if (initialQuestion === null || sentInitial.current) return;
    // Deferred a tick so a mount that's torn down at once (StrictMode) doesn't send and then abort it.
    const timer = window.setTimeout(() => {
      sentInitial.current = true;
      ask(initialQuestion);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [ask, initialQuestion]);

  return (
    <div className="space-y-4" data-testid="ask-chat">
      <AskLocationChip tools={tools} />
      <NewChatBar
        hasChat={chat.turns.length > 0}
        canUndo={chat.canUndo}
        onNewChat={chat.newChat}
        onUndo={chat.undoNewChat}
      />
      {chat.turns.length ? (
        <AskThread chat={chat} tools={tools} />
      ) : (
        <AskEmptyState onPick={ask} disabled={busy} />
      )}
      {chat.failure ? (
        <AskErrorNotice
          key={chat.failure.at}
          failure={chat.failure}
          onRetry={chat.retry}
          onNewChat={chat.newChat}
        />
      ) : null}
      {chat.full ? <AlertBox variant="info">{ASK_COPY.chatFull}</AlertBox> : null}
      <AskComposer value={chat.draft} onChange={chat.setDraft} onSend={ask} busy={busy} disabled={chat.full} />
      <TurnstileField
        resetKey={widget.resetKey}
        expired={widget.expired}
        onVerify={widget.onVerify}
        onExpire={widget.onExpire}
        onRetry={widget.reset}
        action={CHAT_TURNSTILE_ACTION}
        appearance="interaction-only"
      />
    </div>
  );
}
