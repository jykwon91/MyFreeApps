import type { InquirySpamAssessment } from "@/shared/types/inquiry/inquiry-spam-assessment";

export interface InquiryAuditTrailListProps {
  assessments: readonly InquirySpamAssessment[];
}

const ASSESSMENT_LABELS: Record<string, string> = {
  turnstile: "Captcha",
  honeypot: "Honeypot",
  submit_timing: "Submit timing",
  disposable_email: "Disposable email",
  rate_limit: "Rate limit",
  claude_score: "AI score",
  manual_override: "Manual override",
};

export default function InquiryAuditTrailList({ assessments }: InquiryAuditTrailListProps) {
  return (
    <ul className="space-y-2 text-xs" data-testid="spam-assessments-list">
      {assessments.map((a) => {
        const label = ASSESSMENT_LABELS[a.assessment_type] ?? a.assessment_type;
        const passLabel =
          a.passed === null ? "—" : a.passed ? "passed" : "tripped";
        return (
          <li
            key={a.id}
            className="border rounded-md p-2 bg-muted/40"
            data-testid={`spam-assessment-${a.assessment_type}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="font-medium">{label}</span>
                <span className="text-muted-foreground ml-2">{passLabel}</span>
                {a.score !== null ? (
                  <span className="text-muted-foreground ml-2">
                    score {Math.round(a.score)}
                  </span>
                ) : null}
              </div>
              <span className="text-muted-foreground">
                {new Date(a.created_at).toLocaleString()}
              </span>
            </div>
            {a.flags && a.flags.length > 0 ? (
              <p className="mt-1 text-muted-foreground">
                Flags: {a.flags.join(", ")}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
