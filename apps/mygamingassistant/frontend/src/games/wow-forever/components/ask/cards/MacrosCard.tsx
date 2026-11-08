import AskCardLink from "@/games/wow-forever/components/ask/cards/AskCardLink";
import MacroCard from "@/games/wow-forever/components/macros/MacroCard";
import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import type { AskMacrosCard } from "@/games/wow-forever/types/ask/askMacrosCard";

interface MacrosCardProps {
  card: AskMacrosCard;
}

/** Ready-made macros, each the Macros page's own card with its Copy button. */
export default function MacrosCard({ card }: MacrosCardProps) {
  return (
    <section aria-label={ASK_COPY.openMacros} className="space-y-3">
      {card.macros.map((macro) => (
        <MacroCard
          key={macro.id}
          title={macro.title}
          summary={macro.summary}
          text={macro.text}
          headingLevel="h4"
          unconfirmed={macro.unconfirmed}
        />
      ))}
      {card.total > card.macros.length ? (
        <p className="text-xs text-muted-foreground">{ASK_COPY.macrosMore(card.total, card.macros.length)}</p>
      ) : null}
      <AskCardLink to={card.pageHref}>{ASK_COPY.openMacros}</AskCardLink>
    </section>
  );
}
