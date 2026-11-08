import MacroCopyButton from "@/games/wow-forever/components/macros/MacroCopyButton";
import { macroLine } from "@/games/wow-forever/lib/downrank/downrankMath";
import type { DownrankBest } from "@/games/wow-forever/types/downrank/downrankBest";

interface DownrankSuggestionsProps {
  spellName: string;
  amountWord: string;
  best: DownrankBest;
  /** The first rank's learn level, for "learn it at N" when no rank is learnable yet. */
  firstLevel: number;
}

interface Suggestion {
  key: string;
  label: string;
  rank: number;
}

function suggestions(best: DownrankBest, amountWord: string): Suggestion[] {
  if (best.perMana === null || best.perSecond === null) return [];
  if (best.perMana === best.perSecond) {
    return [{ key: "both", label: `Most ${amountWord} per mana and per second`, rank: best.perMana }];
  }
  return [
    { key: "mana", label: `Most ${amountWord} per mana — when mana is tight`, rank: best.perMana },
    { key: "speed", label: `Most ${amountWord} per second — when you need it fast`, rank: best.perSecond },
  ];
}

/** The ranks to use, each with the line that casts it and a copy button. */
export default function DownrankSuggestions({ spellName, amountWord, best, firstLevel }: DownrankSuggestionsProps) {
  const picks = suggestions(best, amountWord);
  return (
    <section className="rounded-xl border bg-card p-3 sm:p-4 space-y-3" aria-labelledby="downrank-suggested-title" data-testid="downrank-suggestions">
      <h2 id="downrank-suggested-title" className="font-semibold">Suggested ranks</h2>
      {picks.length === 0 ? (
        <p className="text-sm text-muted-foreground">You learn {spellName} at level {firstLevel}.</p>
      ) : (
        <ul className="space-y-3">
          {picks.map((pick) => {
            const line = macroLine(spellName, pick.rank);
            return (
              <li key={pick.key} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm">
                    {pick.label}: <span className="font-medium">Rank {pick.rank}</span>
                  </p>
                  <code className="block break-all rounded bg-muted/40 px-2 py-1 text-sm" data-testid="downrank-macro">
                    {line}
                  </code>
                </div>
                <MacroCopyButton text={line} title={`${spellName} Rank ${pick.rank}`} />
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Put the line in a macro (type /macro in game) and drag it to your bars to cast that rank.
      </p>
    </section>
  );
}
