import { AlertTriangle } from "lucide-react";
import { MISSING_FIELD_TOOLTIP } from "@mybookkeeper/api-client/constants/applicantPromote";

/** Warning marker beside a promote field the inquiry didn't fill in. */
export default function PromoteMissingHint() {
  return (
    <span
      className="inline-flex items-center text-orange-500"
      title={MISSING_FIELD_TOOLTIP}
      aria-label={MISSING_FIELD_TOOLTIP}
      data-testid="promote-missing-hint"
    >
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  );
}
