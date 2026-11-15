import { FormField } from "@platform/ui";
import InsuranceFieldProblem from "./InsuranceFieldProblem";
import { insuranceFieldAria } from "./insurance-field-aria";
import { INSURANCE_POLICY_INPUT_CLASS } from "./insurance-policy-input-class";
import { FREQUENCY_LABEL } from "@mybookkeeper/api-client/utils/insurancePolicyFormat";
import type { InsurancePolicyFormValues } from "@mybookkeeper/api-client/types/insurance/insurance-policy-form-values";
import type { InsurancePolicyFormProblems } from "@mybookkeeper/api-client/types/insurance/insurance-policy-form-problems";
import { INSURANCE_PREMIUM_FREQUENCIES } from "@mybookkeeper/api-client/constants/insurancePremiumFrequencies";

export interface InsurancePolicyFormFieldsProps {
  values: InsurancePolicyFormValues;
  onChange: <K extends keyof InsurancePolicyFormValues>(
    field: K,
    value: InsurancePolicyFormValues[K],
  ) => void;
  /** What is wrong with each field, once a save was tried. */
  problems: InsurancePolicyFormProblems;
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
  problems,
}: InsurancePolicyFormFieldsProps) {
  return (
    <>
      <FormField label="Policy name" required>
        {(field) => (
          <>
            <input
              type="text"
              value={values.policyName}
              onChange={(e) => onChange("policyName", e.target.value)}
              placeholder="e.g. Landlord Insurance — 123 Main St"
              className={INSURANCE_POLICY_INPUT_CLASS}
              maxLength={255}
              required
              data-testid="insurance-policy-name-input"
              {...insuranceFieldAria(problems, "policyName")}
              {...field}
            />
            <InsuranceFieldProblem problems={problems} field="policyName" />
          </>
        )}
      </FormField>

      <FormField label="Carrier">
        {(field) => (
          <>
            <input
              type="text"
              value={values.carrier}
              onChange={(e) => onChange("carrier", e.target.value)}
              placeholder="e.g. State Farm"
              className={INSURANCE_POLICY_INPUT_CLASS}
              maxLength={255}
              data-testid="insurance-carrier-input"
              {...insuranceFieldAria(problems, "carrier")}
              {...field}
            />
            <InsuranceFieldProblem problems={problems} field="carrier" />
          </>
        )}
      </FormField>

      <FormField label="Policy number">
        {(field) => (
          <>
            <input
              type="text"
              value={values.policyNumber}
              onChange={(e) => onChange("policyNumber", e.target.value)}
              placeholder="e.g. POL-123456"
              className={INSURANCE_POLICY_INPUT_CLASS}
              maxLength={255}
              data-testid="insurance-policy-number-input"
              {...insuranceFieldAria(problems, "policyNumber")}
              {...field}
            />
            <InsuranceFieldProblem problems={problems} field="policyNumber" />
          </>
        )}
      </FormField>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Effective date">
          {(field) => (
            <input
              type="date"
              value={values.effectiveDate}
              onChange={(e) => onChange("effectiveDate", e.target.value)}
              className={INSURANCE_POLICY_INPUT_CLASS}
              data-testid="insurance-effective-date-input"
              {...field}
            />
          )}
        </FormField>

        <FormField label="Expiration date">
          {(field) => (
            <>
              <input
                type="date"
                value={values.expirationDate}
                onChange={(e) => onChange("expirationDate", e.target.value)}
                className={INSURANCE_POLICY_INPUT_CLASS}
                data-testid="insurance-expiration-date-input"
                {...insuranceFieldAria(problems, "expirationDate")}
                {...field}
              />
              <InsuranceFieldProblem problems={problems} field="expirationDate" />
            </>
          )}
        </FormField>
      </div>

      <FormField label="Coverage amount (USD)">
        {(field) => (
          <>
            <input
              type="number"
              value={values.coverageDollars}
              onChange={(e) => onChange("coverageDollars", e.target.value)}
              placeholder="e.g. 500000"
              min="0"
              step="1"
              className={INSURANCE_POLICY_INPUT_CLASS}
              data-testid="insurance-coverage-input"
              {...insuranceFieldAria(problems, "coverageDollars")}
              {...field}
            />
            <InsuranceFieldProblem problems={problems} field="coverageDollars" />
          </>
        )}
      </FormField>

      <div className="pt-2 border-t space-y-4">
        <p className="text-xs text-muted-foreground">
          What it costs — needed to tell whether this policy is priced in line
          with the market.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Premium (USD)">
            {(field) => (
              <>
                <input
                  type="number"
                  value={values.premiumDollars}
                  onChange={(e) => onChange("premiumDollars", e.target.value)}
                  placeholder="e.g. 1240"
                  min="0"
                  step="0.01"
                  className={INSURANCE_POLICY_INPUT_CLASS}
                  data-testid="insurance-premium-input"
                  {...insuranceFieldAria(problems, "premiumDollars")}
                  {...field}
                />
                <InsuranceFieldProblem problems={problems} field="premiumDollars" />
              </>
            )}
          </FormField>

          <FormField label="Billed">
            {(field) => (
              <>
                <select
                  value={values.premiumFrequency}
                  onChange={(e) => onChange("premiumFrequency", e.target.value)}
                  className={INSURANCE_POLICY_INPUT_CLASS}
                  data-testid="insurance-premium-frequency-select"
                  {...insuranceFieldAria(problems, "premiumFrequency")}
                  {...field}
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
                <InsuranceFieldProblem problems={problems} field="premiumFrequency" />
              </>
            )}
          </FormField>
        </div>

        {/* Kept out of the premium because only the premium is comparable to a
            benchmark or a competing quote, while only the total reconciles
            against the bank. A surplus-lines policy separates them by ~15%. */}
        <FormField label="Fees & taxes (USD)">
          {(field) => (
            <>
              <input
                type="number"
                value={values.feesAndTaxesDollars}
                onChange={(e) => onChange("feesAndTaxesDollars", e.target.value)}
                placeholder="e.g. 394.17"
                min="0"
                step="0.01"
                className={INSURANCE_POLICY_INPUT_CLASS}
                data-testid="insurance-fees-and-taxes-input"
                {...insuranceFieldAria(problems, "feesAndTaxesDollars")}
                {...field}
              />
              <InsuranceFieldProblem problems={problems} field="feesAndTaxesDollars" />
              <p className="mt-1 text-xs text-muted-foreground">
                Policy, inspection and agent fees, surplus lines tax and stamping
                fee — everything on the bill that isn&apos;t premium, for the whole
                policy term. Leave blank if the carrier charges none.
              </p>
            </>
          )}
        </FormField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Deductible (USD)">
            {(field) => (
              <>
                <input
                  type="number"
                  value={values.deductibleDollars}
                  onChange={(e) => onChange("deductibleDollars", e.target.value)}
                  placeholder="e.g. 2500"
                  min="0"
                  step="1"
                  className={INSURANCE_POLICY_INPUT_CLASS}
                  data-testid="insurance-deductible-input"
                  {...insuranceFieldAria(problems, "deductibleDollars")}
                  {...field}
                />
                <InsuranceFieldProblem problems={problems} field="deductibleDollars" />
              </>
            )}
          </FormField>

          <FormField label="Wind / hail deductible (% of coverage)">
            {(field) => (
              <>
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
                  {...insuranceFieldAria(problems, "windHailPct")}
                  {...field}
                />
                <InsuranceFieldProblem problems={problems} field="windHailPct" />
              </>
            )}
          </FormField>
        </div>
      </div>

      <FormField label="Notes">
        {(field) => (
          <>
            <textarea
              value={values.notes}
              onChange={(e) => onChange("notes", e.target.value)}
              placeholder="Any additional notes about this policy..."
              className={`${INSURANCE_POLICY_INPUT_CLASS} resize-none`}
              rows={3}
              maxLength={5000}
              data-testid="insurance-notes-input"
              {...insuranceFieldAria(problems, "notes")}
              {...field}
            />
            <InsuranceFieldProblem problems={problems} field="notes" />
          </>
        )}
      </FormField>
    </>
  );
}
