import { Fragment, useMemo } from "react";
import clsx from "clsx";
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import { TRIAGE_CHIP } from "@/games/wow-forever/data/featureRequests/triage/triageStyles";
import { hiddenCharMarker, revealHiddenChars } from "@/games/wow-forever/lib/featureRequests/triage/revealHiddenChars";

interface TriageSubmissionQuoteProps {
  label: string;
  /** Null once retention deleted the text. */
  text: string | null;
}

/**
 * A player's own words, untrusted: a labelled, visually distinct box rendered ONLY as text nodes (no
 * markup, no links). Zero-width and direction-changing characters show as `⟨U+XXXX⟩` with a badge, the
 * whole text sits in a `<bdi>`, and long text scrolls inside the box.
 */
export default function TriageSubmissionQuote({ label, text }: TriageSubmissionQuoteProps) {
  const revealed = useMemo(() => revealHiddenChars(text ?? ""), [text]);
  return (
    <figure
      data-untrusted="true"
      className="rounded-md border border-dashed border-amber-400 bg-muted/30 p-3 dark:border-amber-700"
    >
      <figcaption className="mb-1 flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
        <span>{label}</span>
        {revealed.hasHidden ? (
          <span className={clsx(TRIAGE_CHIP, "border-amber-400 text-amber-800 dark:text-amber-200")}>
            {TRIAGE_COPY.hiddenCharacters}
          </span>
        ) : null}
      </figcaption>
      {text === null ? (
        <p className="text-sm italic text-muted-foreground">{TRIAGE_COPY.textGone}</p>
      ) : (
        <blockquote className="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">
          <bdi>
            {revealed.segments.map((segment, i) =>
              segment.kind === "text" ? (
                <Fragment key={i}>{segment.text}</Fragment>
              ) : (
                <span key={i} className="mx-0.5 rounded border border-amber-400 px-1 text-xs text-amber-800 dark:text-amber-200">
                  {hiddenCharMarker(segment.codePoint)}
                </span>
              ),
            )}
          </bdi>
        </blockquote>
      )}
    </figure>
  );
}
