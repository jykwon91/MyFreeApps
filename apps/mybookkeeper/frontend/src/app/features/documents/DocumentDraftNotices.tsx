import AlertBox from "@/shared/components/ui/AlertBox";
import type { AlertVariant } from "@/shared/components/ui/AlertBox";

/** The three things every draft reports beyond the fields it filled in. */
export interface DraftNoticeSource {
  confidence: string;
  warnings: string[];
  unrepresented: string[];
}

export interface DocumentDraftNoticesProps {
  draft: DraftNoticeSource;
  /** The reader's own written summary of the document. Never auto-filled. */
  notes: string | null;
  /** Namespaces the test ids so each domain's specs address their own notices. */
  testIdPrefix: string;
}

const CONFIDENCE_NOTE: Record<string, string> = {
  high: "I read these straight off the document.",
  medium: "Some of these I had to interpret — worth a look before you save.",
  low: "I wasn't very sure about this one. Please check every field.",
};

/**
 * "Check every field" is a warning, not a note.
 *
 * These three shared one blue box until the boxes below them stopped being blue
 * too, and low read exactly like medium — the same tint saying "worth a look"
 * and "I wasn't sure about any of this".
 */
const CONFIDENCE_VARIANT: Record<string, AlertVariant> = {
  high: "success",
  medium: "info",
  low: "warning",
};

/** The document's own paragraphs, kept as paragraphs. */
function notesParagraphs(notes: string): string[] {
  return notes
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "");
}

/** What the folded section says about itself while it is still folded. */
function referenceSummary(termCount: number, hasNotes: boolean): string {
  const plural = termCount === 1 ? "" : "s";
  const terms = `I noticed ${termCount} more term${plural} on the document`;
  if (termCount > 0 && hasNotes) return `${terms}, plus some notes I jotted down.`;
  if (termCount > 0) return `${terms}.`;
  return "I also jotted down some notes about this document.";
}

/**
 * What the reading said beyond the fields it filled in.
 *
 * Split by when the operator needs it, which is the only division that changes
 * what they do. Confidence and warnings answer "can I trust what got filled in,
 * or must I fix something before saving" — they are the reason this panel is
 * open, and they stay in view. Everything else is reference: real, worth
 * keeping, but nothing above it changes because of it. The mortgagee's loan
 * number matters the day there is a claim, not the moment before Save.
 *
 * So the reference half is folded away behind a count. Folded is not dropped —
 * the summary says how much is there and one tap opens all of it, verbatim.
 * What it stops doing is claiming the same urgency as a field that may be
 * wrong. Every box on this panel used to be the same blue, which left the
 * operator to work out on their own which of them was asking for something.
 */
export default function DocumentDraftNotices({
  draft,
  notes,
  testIdPrefix,
}: DocumentDraftNoticesProps) {
  const note = CONFIDENCE_NOTE[draft.confidence] ?? CONFIDENCE_NOTE.low;
  const variant = CONFIDENCE_VARIANT[draft.confidence] ?? CONFIDENCE_VARIANT.low;

  const terms = draft.unrepresented;
  const paragraphs = notes === null ? [] : notesParagraphs(notes);
  const hasReference = terms.length > 0 || paragraphs.length > 0;

  return (
    <div className="space-y-2" data-testid={`${testIdPrefix}-draft-notices`}>
      <AlertBox variant={variant}>{note}</AlertBox>

      {draft.warnings.map((warning) => (
        <AlertBox key={warning} variant="warning">
          {warning}
        </AlertBox>
      ))}

      {hasReference && (
        <details
          className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-800 dark:bg-gray-900/40"
          data-testid={`${testIdPrefix}-draft-reference`}
        >
          <summary className="flex min-h-11 cursor-pointer items-center font-medium">
            {referenceSummary(terms.length, paragraphs.length > 0)}
          </summary>

          {terms.length > 0 && (
            <div className="mt-2">
              <p className="font-medium">Other terms from the document:</p>
              <ul className="mt-1 list-disc pl-5">
                {terms.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {paragraphs.length > 0 && (
            <div className="mt-3">
              <p className="font-medium">My notes on this document:</p>
              <div className="mt-1 space-y-2">
                {paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </div>
          )}
        </details>
      )}
    </div>
  );
}
