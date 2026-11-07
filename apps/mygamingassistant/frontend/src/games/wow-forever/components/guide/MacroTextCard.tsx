import MacroCopyButton from "@/games/wow-forever/components/shared/MacroCopyButton";
import { MACRO_MAX_LENGTH } from "@/games/wow-forever/data/macroMaxLength";

interface MacroTextCardProps {
  title: string;
  summary: string;
  text: string;
  /** The card's heading level under its section; defaults to h4. */
  headingLevel?: "h4" | "h5";
}

/** One macro in the Guide: what it's for, its text, the character count and a Copy button. */
export default function MacroTextCard({ title, summary, text, headingLevel = "h4" }: MacroTextCardProps) {
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
      </p>
    </article>
  );
}
