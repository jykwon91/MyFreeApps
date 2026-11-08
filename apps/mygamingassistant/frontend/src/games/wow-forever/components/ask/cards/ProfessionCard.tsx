import AskCardLink from "@/games/wow-forever/components/ask/cards/AskCardLink";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import type { AskProfessionCard } from "@/games/wow-forever/types/ask/askProfessionCard";

interface ProfessionCardProps {
  card: AskProfessionCard;
}

/** The next steps of the site's route for a profession, from the player's skill — and the full guide. */
export default function ProfessionCard({ card }: ProfessionCardProps) {
  const heading = ASK_COPY.professionHeading(card.label, card.skill);
  return (
    <section aria-label={heading} className="space-y-3 rounded-xl border bg-card p-3">
      <h3 className="text-sm font-semibold">{heading}</h3>
      {card.rows.length ? (
        <ol className="divide-y">
          {card.rows.map((row) => (
            <li key={`${row.skill}-${row.name}`} className="space-y-0.5 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-x-2">
                <span className="font-semibold tabular-nums">{row.skill}</span>
                <span className="font-medium">{row.name}</span>
                {row.provenance ? <ProvenanceBadge {...row.provenance} /> : null}
              </div>
              {row.lines.map((line) => (
                <p key={line} className="text-xs text-muted-foreground">
                  {line}
                </p>
              ))}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">{ASK_COPY.professionDone}</p>
      )}
      {card.more > 0 ? <p className="text-xs text-muted-foreground">{ASK_COPY.professionMore(card.more)}</p> : null}
      {card.priced ? <p className="text-xs text-muted-foreground">{ASK_COPY.pricedNote}</p> : null}
      <AskCardLink to={card.pageHref}>{ASK_COPY.openProfession(card.label)}</AskCardLink>
    </section>
  );
}
