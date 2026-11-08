import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import type { AskNoResultsCard } from "@/games/wow-forever/types/ask/askNoResultsCard";

interface NoResultsCardProps {
  card: AskNoResultsCard;
}

/** A tool found nothing for what was asked. */
export default function NoResultsCard({ card }: NoResultsCardProps) {
  return <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">{ASK_COPY.noResults(card.query)}</p>;
}
