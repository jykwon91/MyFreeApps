import { Check, X } from "lucide-react";
import {
  computeInquiryQualityScore,
  type InquiryQualitySignals,
} from "@/shared/lib/inquiry-quality";

interface Props {
  signals: InquiryQualitySignals;
}

interface Factor {
  label: string;
  satisfied: boolean;
}

const BODY_LENGTH_THRESHOLD = 100;

/**
 * Renders the 4-factor inquiry quality breakdown for the detail page.
 *
 * Surfaces what's missing so the host can chase it (per RENTALS_PLAN.md
 * §9.1 detail-page hierarchy: "what's missing"). Mirrors the heuristic in
 * ``shared/lib/inquiry-quality.ts``.
 */
export default function InquiryQualityBreakdown({ signals }: Props) {
  const score = computeInquiryQualityScore(signals);
  const employerLen = signals.inquirer_employer?.trim().length ?? 0;
  const bodyLen = signals.last_message_body?.trim().length ?? 0;

  const factors: Factor[] = [
    {
      label: "Start date set",
      satisfied: !!signals.desired_start_date,
    },
    {
      label: "End date set",
      satisfied: !!signals.desired_end_date,
    },
    {
      label: employerLen > 0 ? "Employer / hospital provided" : "Employer / hospital missing",
      satisfied: employerLen > 0,
    },
    {
      label: bodyLen > BODY_LENGTH_THRESHOLD
        ? `Detailed message (${bodyLen} chars)`
        : `Sparse message (${bodyLen} chars)`,
      satisfied: bodyLen > BODY_LENGTH_THRESHOLD,
    },
  ];

  return (
    <section className="border rounded-lg p-4 space-y-2" data-testid="inquiry-quality-breakdown">
      <h2 className="text-sm font-medium">Quality score: {score} / 4</h2>
      <ul className="space-y-1 text-sm">
        {factors.map((f) => (
          <li key={f.label} className="flex items-center gap-2">
            {f.satisfied ? (
              <Check className="h-4 w-4 text-green-600 shrink-0" aria-hidden="true" />
            ) : (
              <X className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
            )}
            <span className={f.satisfied ? "text-foreground" : "text-muted-foreground"}>
              {f.label}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
