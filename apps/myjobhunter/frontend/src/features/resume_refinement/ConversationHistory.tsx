import { useEffect, useRef } from "react";
import ConversationBubble from "@/features/resume_refinement/ConversationBubble";
import SectionDivider from "@/features/resume_refinement/SectionDivider";
import PendingEchoBubbles from "@/features/resume_refinement/PendingEchoBubbles";
import { buildItems } from "@/features/resume_refinement/conversation-turn-render";
import type { RefinementTurn } from "@/types/resume-refinement/refinement-turn";

interface ConversationHistoryProps {
  turns: RefinementTurn[];
  /** Optimistic echo of a just-sent composer message — rendered as a
   *  user bubble + assistant thinking bubble until the real turn rows
   *  arrive from the poll/mutation (the owner clears it on
   *  turn_count advance, NOT on promise resolution, to avoid a
   *  disappear/reappear flicker). */
  pendingUserEcho?: { text: string } | null;
}

/**
 * Chat-style transcript of every previous turn in the refinement session.
 *
 * Standard chat layout: user bubbles right, AI bubbles left, max-width
 * constrained, distinct fills, "flat corner" toward the speaker side. A
 * thin labeled divider marks transitions between target sections so the
 * history reads as grouped chapters rather than one undifferentiated stream.
 *
 * Auto-scrolls to the latest turn on every length change AND when the
 * optimistic echo appears — otherwise a sent message can render
 * off-screen until the real turn lands.
 */
export default function ConversationHistory({
  turns,
  pendingUserEcho = null,
}: ConversationHistoryProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const echoText = pendingUserEcho?.text ?? null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, echoText]);

  const items = buildItems(turns);
  if (items.length === 0 && !pendingUserEcho) return null;

  return (
    <section
      className="flex flex-col gap-1.5"
      aria-label="Refinement conversation history"
    >
      <ol role="list" aria-label="Conversation turns" className="flex flex-col gap-1.5">
        {items.map((item, idx) =>
          item.kind === "divider" ? (
            <SectionDivider key={`divider-${idx}-${item.section}`} section={item.section} />
          ) : (
            <ConversationBubble key={item.turn.id} turn={item.turn} />
          ),
        )}
        {pendingUserEcho && <PendingEchoBubbles text={pendingUserEcho.text} />}
      </ol>
      <div ref={bottomRef} aria-hidden />
    </section>
  );
}
