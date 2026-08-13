import AlertBox from "@/shared/components/ui/AlertBox";

/** The three things every draft reports beyond the fields it filled in. */
export interface DraftNoticeSource {
  confidence: string;
  warnings: string[];
  unrepresented: string[];
}

export interface DocumentDraftNoticesProps {
  draft: DraftNoticeSource;
  /** Terms the database holds but this form does not edit yet. */
  unheld: string[];
  /** Names the record type, e.g. "a plan record" / "a policy record". */
  unrepresentedLabel: string;
  /** Namespaces the test ids so each domain's specs address their own notices. */
  testIdPrefix: string;
}

const CONFIDENCE_NOTE: Record<string, string> = {
  high: "I read these straight off the document.",
  medium: "Some of these I had to interpret — worth a look before you save.",
  low: "I wasn't very sure about this one. Please check every field.",
};

/**
 * What the reading said beyond the fields it filled in.
 *
 * Three separate lists, because they mean different things and the operator
 * acts differently on each: ``warnings`` are fields that may be wrong,
 * ``unrepresented`` are real terms the database has no column for, and the
 * form-can't-hold list is terms the database holds but this form doesn't edit
 * yet. All three exist so nothing the document said gets dropped in silence.
 */
export default function DocumentDraftNotices({
  draft,
  unheld,
  unrepresentedLabel,
  testIdPrefix,
}: DocumentDraftNoticesProps) {
  const note = CONFIDENCE_NOTE[draft.confidence] ?? CONFIDENCE_NOTE.low;

  return (
    <div className="space-y-2" data-testid={`${testIdPrefix}-draft-notices`}>
      <AlertBox variant={draft.confidence === "high" ? "success" : "info"}>
        {note}
      </AlertBox>

      {draft.warnings.map((warning) => (
        <AlertBox key={warning} variant="warning">
          {warning}
        </AlertBox>
      ))}

      {unheld.length > 0 && (
        <AlertBox variant="info">
          <p className="font-medium">
            The document also stated these, and this form has no field for them yet:
          </p>
          <ul className="mt-1 list-disc pl-5">
            {unheld.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </AlertBox>
      )}

      {draft.unrepresented.length > 0 && (
        <AlertBox variant="info">
          <p className="font-medium">
            And these terms don't fit anywhere in {unrepresentedLabel}:
          </p>
          <ul className="mt-1 list-disc pl-5">
            {draft.unrepresented.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </AlertBox>
      )}
    </div>
  );
}
