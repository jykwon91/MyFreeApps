import { AlertCircle } from "lucide-react";
import type { ScreeningEligibilityResponse } from "@/shared/types/screening/screening-eligibility-response";

interface Props {
  eligibility: ScreeningEligibilityResponse;
}

/**
 * Renders the eligibility gate when the applicant is NOT yet screen-able.
 *
 * Shows a clear explanation of what's missing so the host knows exactly what
 * to fill in before they can initiate screening.
 *
 * This component is only rendered when ``eligibility.eligible === false``.
 */
export default function ScreeningEligibilityGate({ eligibility }: Props) {
  const { missing_fields } = eligibility;

  return (
    <div
      data-testid="screening-eligibility-gate"
      className="flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-950"
    >
      <AlertCircle
        className="h-5 w-5 flex-shrink-0 text-yellow-600 dark:text-yellow-400 mt-0.5"
        aria-hidden="true"
      />
      <div className="text-sm">
        <p className="font-medium text-yellow-800 dark:text-yellow-200">
          I need a bit more info before I can start screening
        </p>
        {missing_fields.length > 0 ? (
          <ul className="mt-1.5 space-y-0.5 text-yellow-700 dark:text-yellow-300">
            {missing_fields.map((field) => (
              <li key={field} className="flex items-center gap-1.5">
                <span aria-hidden="true">•</span>
                {field}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-2 text-yellow-700 dark:text-yellow-300">
          Add the missing details in the sections above, then come back here to run screening.
        </p>
      </div>
    </div>
  );
}
