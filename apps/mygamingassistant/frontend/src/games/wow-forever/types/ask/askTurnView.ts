import type { AskCard } from "@/games/wow-forever/types/ask/askCard";

/** One question and its answer, as the thread shows them. */
export interface AskTurnView {
  /** Index of the question in the conversation — stable while the chat lasts. */
  key: number;
  question: string;
  /** Claude's text, every reply of the turn joined. */
  answer: string;
  cards: { id: string; card: AskCard }[];
  /** The answer is still coming (the last turn while a send is in flight). */
  pending: boolean;
}
