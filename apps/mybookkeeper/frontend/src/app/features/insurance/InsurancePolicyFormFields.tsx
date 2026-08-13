import FormField from "@/shared/components/ui/FormField";
import { INSURANCE_POLICY_INPUT_CLASS } from "./insurance-policy-input-class";
import { FREQUENCY_LABEL } from "@/shared/lib/insurance-policy-format";
import type { InsurancePolicyFormValues } from "@/shared/types/insurance/insurance-policy-form-values";
import { INSURANCE_PREMIUM_FREQUENCIES } from "@/shared/types/insurance/insurance-premium-frequency";

export interface InsurancePolicyFormFieldsProps {
  values: InsurancePolicyFormValues;
  onChange: <K extends keyof InsurancePolicyFormValues>(
    field: K,
    value: InsurancePolicyFormValues[K],
  ) => void;
}

/**
 * The insurance-policy field set, shared by the add and edit dialogs.
 *
 * Cost sits in its own group below coverage: what a policy covers and what it
 * costs are read at different moments — the first when a claim happens, the
 * second at renewal — and interleaving them buried the premium among dates.
 */
export default function InsurancePolicyFormFields({
  values,
  onChange,
}: InsurancePolicyFormFieldsProps) {
  return (
    <>
      <FormField label="Policy name" required>
        <input
          type="text"
          value={values.policyName}
          onChange={(e) => onChange("policyName", e.target.value)}
          placeholder="e.g. Landlord Insurance — 123 Main St"
          className={INSURANCE_POLICY_INPUT_CLASS}
          maxLength={255}
          required
          data-testid="insurance-policy-name-input"
        />
      </FormField>

      <FormField label="Carrier">
        <input
          type="text"
          value={values.carrier}
          onChange={(e) => onChange("carrier", e.target.value)}
          placeholder="e.g. State Farm"
          className={INSURANCE_POLICY_INPUT_CLASS}
          maxLength={255}
          data-testid="insurance-carrier-input"
        />
      </FormField>

      <FormField label="Policy number">
        <input
          type="text"
          value={values.policyNumber}
          onChange={(e) => onChange("policyNumber", e.target.value)}
          placeholder="e.g. POL-123456"
          className={INSURANCE_POLICY_INPUT_CLASS}
          maxLength={255}
          data-testid="insurance-policy-number-input"
        />
      </FormField>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Effective date">
          <input
            type="date"
            value={values.effectiveDate}
            onChange={(e) => onChange("effectiveDate", e.target.value)}
            className={INSURANCE_POLICY_INPUT_CLASS}
            data-testid="insurance-effective-date-input"
          />
        </FormField>

        <FormField label="Expiration date">
          <input
            type="date"
            value={values.expirationDate}
            onChange={(e) => onChange("expirationDate", e.target.value)}
            className={INSURANCE_POLICY_INPUT_CLASS}
            data-testid="insurance-expiration-date-input"
          />
        </FormField>
      </div>

      <FormField label="Coverage amount (USD)">
        <input
          type="number"
          value={values.coverageDollars}
          onChange={(e) => onChange("coverageDollars", e.target.value)}
          placeholder="e.g. 500000"
          min="0"
          step="1"
          className={INSURANCE_POLICY_INPUT_CLASS}
          data-testid="insurance-coverage-input"
        />
      </FormField>

      <div className="pt-2 border-t space-y-4">
        <p className="text-xs text-muted-foreground">
          What it costs — needed to tell whether this policy is priced in line
          with the market.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Premium (USD)">
            <input
              type="number"
              value={values.premiumDollars}
              onChange={(e) => onChange("premiumDollars", e.target.value)}
              placeholder="e.g. 1240"
              min="0"
              step="0.01"
              className={INSURANCE_POLICY_INPUT_CLASS}
              data-testid="insurance-premium-input"
            />
          </FormField>

          <FormField label="Billed">
            <select
              value={values.premiumFrequency}
              onChange={(e) => onChange("premiumFrequency", e.target.value)}
              className={INSURANCE_POLICY_INPUT_CLASS}
              data-testid="insurance-premium-frequency-select"
            >
              {/* Blank rather than a default period: guessing "annually" over a
                  monthly premium understates the yearly cost by 12x. */}
              <option value="">Select…</option>
              {INSURANCE_PREMIUM_FREQUENCIES.map((frequency) => (
                <option key={frequency} value={frequency}>
                  {FREQUENCY_LABEL[frequency]}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Deductible (USD)">
            <input
              type="number"
              value={values.deductibleDollars}
              onChange={(e) => onChange("deductibleDollars", e.target.value)}
              placeholder="e.g. 2500"
              min="0"
              step="1"
              className={INSURANCE_POLICY_INPUT_CLASS}
              data-testid="insurance-deductible-input"
            />
          </FormField>

          <FormField label="Wind / hail deductible (% of coverage)">
            <input
              type="number"
              value={values.windHailPct}
              onChange={(e) => onChange("windHailPct", e.target.value)}
              placeholder="e.g. 2"
              min="0"
              max="100"
              step="0.01"
              className={INSURANCE_POLICY_INPUT_CLASS}
              data-testid="insurance-wind-hail-input"
            />
          </FormField>
        </div>
      </div>

      <FormField label="Notes">
        <textarea
          value={values.notes}
          onChange={(e) => onChange("notes", e.target.value)}
          placeholder="Any additional notes about this policy..."
          className={`${INSURANCE_POLICY_INPUT_CLASS} resize-none`}
          rows={3}
          maxLength={5000}
          data-testid="insurance-notes-input"
        />
      </FormField>
    </>
  );
}
