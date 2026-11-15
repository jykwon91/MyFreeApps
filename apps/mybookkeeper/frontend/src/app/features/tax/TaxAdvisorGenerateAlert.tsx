import { TAX_ADVISOR_CTA_MESSAGES } from "@mybookkeeper/api-client/constants/taxAdvisor";
import type { AdvisorCtaState } from "@mybookkeeper/api-client/types/tax/AdvisorCtaState";

export interface TaxAdvisorGenerateAlertProps {
  state: AdvisorCtaState;
}

/** Says why the last "Regenerate" didn't refresh the advice, so the older advice below isn't mistaken for new. */
export default function TaxAdvisorGenerateAlert({ state }: TaxAdvisorGenerateAlertProps) {
  if (state === "idle") return null;
  return (
    <p role="alert" className="text-sm text-destructive" data-testid="tax-advisor-generate-alert">
      {TAX_ADVISOR_CTA_MESSAGES[state]}
    </p>
  );
}
