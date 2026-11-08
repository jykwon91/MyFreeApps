/**
 * The conversation as the thread shows it: one turn per question, with
 * Claude's text joined and the cards of its tool calls (at most
 * `ASK_LIMITS.cardsPerTurn`, in call order). Tool results never show.
 */
import { CHAT_BLOCK, CHAT_ROLE } from "@/games/wow-forever/data/ask/askChatWire";
import { ASK_LIMITS } from "@/games/wow-forever/data/ask/askLimits";
import type { AskCard } from "@/games/wow-forever/types/ask/askCard";
import type { AskTurnView } from "@/games/wow-forever/types/ask/askTurnView";
import type { ChatMessage } from "@/games/wow-forever/types/ask/chatMessage";

/** The question a user message asks; null for a tool-results message. */
export function questionOf(message: ChatMessage): string | null {
  if (message.role !== CHAT_ROLE.user) return null;
  const block = message.content[0];
  return block?.type === CHAT_BLOCK.text ? block.text : null;
}

export function countQuestions(messages: readonly ChatMessage[]): number {
  return messages.filter((m) => questionOf(m) !== null).length;
}

/** No room for another question: the question cap, or not enough messages left for one with every tool round. */
export function isChatFull(messages: readonly ChatMessage[]): boolean {
  return (
    countQuestions(messages) >= ASK_LIMITS.questionsPerChat ||
    messages.length + ASK_LIMITS.messagesPerQuestion > ASK_LIMITS.messagesPerChat
  );
}

export function buildTurns(
  messages: readonly ChatMessage[],
  cards: Readonly<Record<string, AskCard>>,
  answering: boolean,
): AskTurnView[] {
  const turns: AskTurnView[] = [];
  messages.forEach((message, index) => {
    const question = questionOf(message);
    if (question !== null) {
      turns.push({ key: index, question, answer: "", cards: [], pending: false });
      return;
    }
    const turn = turns[turns.length - 1];
    if (turn === undefined || message.role !== CHAT_ROLE.assistant) return;
    for (const block of message.content) {
      if (block.type === CHAT_BLOCK.text) {
        turn.answer = turn.answer ? `${turn.answer}\n\n${block.text}` : block.text;
      } else if (block.type === CHAT_BLOCK.toolUse) {
        const card = cards[block.id];
        if (card !== undefined && turn.cards.length < ASK_LIMITS.cardsPerTurn) turn.cards.push({ id: block.id, card });
      }
    }
  });
  const last = turns[turns.length - 1];
  if (answering && last !== undefined) last.pending = true;
  return turns;
}
