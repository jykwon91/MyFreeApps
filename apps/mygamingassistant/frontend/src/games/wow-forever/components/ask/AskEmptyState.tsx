import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import { ASK_EXAMPLES } from "@/games/wow-forever/data/ask/askExamples";

interface AskEmptyStateProps {
  onPick: (question: string) => void;
  disabled: boolean;
}

/** A new chat: what Ask is for, and example questions that send on a tap. */
export default function AskEmptyState({ onPick, disabled }: AskEmptyStateProps) {
  return (
    <section aria-label={ASK_COPY.emptyHeading} data-section="body" className="space-y-3 rounded-xl border border-dashed p-4">
      <h2 className="text-base font-semibold">{ASK_COPY.emptyHeading}</h2>
      <p className="text-sm text-muted-foreground">{ASK_COPY.emptyBody}</p>
      <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {ASK_EXAMPLES.map((example) => (
          <li key={example}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(example)}
              className="min-h-[44px] w-full rounded-full border px-4 text-left text-sm hover:bg-muted/50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
            >
              {example}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
