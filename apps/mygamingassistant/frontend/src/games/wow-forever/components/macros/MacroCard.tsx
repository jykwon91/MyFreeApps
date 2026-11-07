import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import MacroCopyButton from "@/games/wow-forever/components/macros/MacroCopyButton";
import { MACRO_MAX_LENGTH } from "@/games/wow-forever/data/macros/macroMaxLength";
import { SYNTAX_NOTES } from "@/games/wow-forever/data/macros/macroSyntaxNotes";
import type { MacroSyntax } from "@/games/wow-forever/types/macros/macroSyntax";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

interface MacroCardProps {
  title: string;
  summary: string;
  text: string;
  /** The card's heading level under its section. */
  headingLevel: "h4" | "h5";
  /** Spell and item names the macro uses; empty for a template the player fills in. */
  names?: readonly string[];
  /** Names the Forever client doesn't have; empty when every one is confirmed. */
  missing?: readonly string[];
  unconfirmed?: readonly MacroSyntax[];
}

/** One macro: what it does, its text, the character count, its name check and a Copy button. */
export default function MacroCard({
  title,
  summary,
  text,
  headingLevel,
  names = [],
  missing = [],
  unconfirmed = [],
}: MacroCardProps) {
  const Heading = headingLevel;
  return (
    <article aria-label={title} className="rounded-xl border bg-card p-4 space-y-3 min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <Heading className="font-semibold">{title}</Heading>
          <p className="text-sm text-muted-foreground">{summary}</p>
        </div>
        <MacroCopyButton text={text} title={title} />
      </div>
      <pre
        className="rounded-md bg-muted/40 p-3 text-xs sm:text-sm font-mono whitespace-pre-wrap break-words"
        data-testid="macro-text"
      >
        {text}
      </pre>
      <p className="text-xs text-muted-foreground">
        {text.length} of {MACRO_MAX_LENGTH} characters
        {names.length > 0 && (
          <>
            {" · "}
            {missing.length === 0
              ? `Names checked against the Forever client: ${names.join(", ")}`
              : `Not found in the Forever client: ${missing.join(", ")}`}
          </>
        )}
      </p>
      {unconfirmed.length > 0 && (
        <div className="space-y-1 text-xs text-muted-foreground">
          <ProvenanceBadge provenance={PROVENANCE.unconfirmed} />
          <ul className="list-disc pl-5">
            {unconfirmed.map((syntax) => (
              <li key={syntax}>{SYNTAX_NOTES[syntax]}</li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
