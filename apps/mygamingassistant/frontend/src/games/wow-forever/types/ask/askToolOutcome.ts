import type { AskCard } from "@/games/wow-forever/types/ask/askCard";

/** A tool run: the compact JSON Claude reads, and the card the page shows (null = nothing to show). */
export interface AskToolOutcome {
  content: string;
  isError: boolean;
  card: AskCard | null;
}
