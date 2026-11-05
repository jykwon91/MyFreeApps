import UnconfirmedChip from "@/games/wow-forever/components/professions/UnconfirmedChip";
import MacroCopyButton from "@/games/wow-forever/components/warlock/MacroCopyButton";
import { SYNTAX_NOTES } from "@/games/wow-forever/data/warlock/macroSyntaxNotes";
import { MACRO_MAX_LENGTH } from "@/games/wow-forever/lib/warlockMacros";
import type { WarlockMacro } from "@/games/wow-forever/types/warlockMacro";

interface WarlockMacroCardProps {
  macro: WarlockMacro;
  /** Names in the macro that the Forever client doesn't have; empty when every one is confirmed. */
  missing: readonly string[];
}

/** One macro: what it does, its text, and a Copy button. */
export default function WarlockMacroCard({ macro, missing }: WarlockMacroCardProps) {
  const names = [...macro.spells, ...macro.items];
  return (
    <article aria-label={macro.title} className="rounded-xl border bg-card p-4 space-y-3 min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <h3 className="font-semibold">{macro.title}</h3>
          <p className="text-sm text-muted-foreground">{macro.summary}</p>
        </div>
        <MacroCopyButton text={macro.text} title={macro.title} />
      </div>
      <pre className="rounded-md bg-muted/40 p-3 text-xs sm:text-sm whitespace-pre-wrap break-words" data-testid="macro-text">
        {macro.text}
      </pre>
      <p className="text-xs text-muted-foreground">
        {macro.text.length} of {MACRO_MAX_LENGTH} characters
        {names.length > 0 && (
          <>
            {" · "}
            {missing.length === 0
              ? `Names checked against the Forever client: ${names.join(", ")}`
              : `Not found in the Forever client: ${missing.join(", ")}`}
          </>
        )}
      </p>
      {macro.unconfirmed.length > 0 && (
        <div className="space-y-1 text-xs text-muted-foreground">
          <UnconfirmedChip />
          <ul className="list-disc pl-5">
            {macro.unconfirmed.map((syntax) => (
              <li key={syntax}>{SYNTAX_NOTES[syntax]}</li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
