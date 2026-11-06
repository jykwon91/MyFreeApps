import { FormField } from "@platform/ui";
import type { MortgageFormValues } from "@/shared/types/mortgage/mortgage-form-values";
import { MORTGAGE_INPUT_CLASS } from "./mortgage-input-class";

export interface MortgageFormFieldsProps {
  values: MortgageFormValues;
  onChange: <K extends keyof MortgageFormValues>(
    field: K,
    value: MortgageFormValues[K],
  ) => void;
}

/**
 * The mortgage field set, shared by the add and edit dialogs.
 *
 * Ordered by what the comparison needs, not by what a statement prints. The
 * rate and whether it can move come first because together they decide whether
 * the loan can be benchmarked at all; the balance and the payoff clock come
 * next because they turn a rate difference into dollars. Everything below the
 * divider is record-keeping.
 */
export default function MortgageFormFields({
  values,
  onChange,
}: MortgageFormFieldsProps) {
  const isArm = values.rateType === "arm";

  return (
    <>
      <FormField label="Lender">
        {(field) => (
          <input
            type="text"
            value={values.lender}
            onChange={(e) => onChange("lender", e.target.value)}
            placeholder="e.g. Chase"
            className={MORTGAGE_INPUT_CLASS}
            maxLength={255}
            data-testid="mortgage-lender-input"
            {...field}
          />
        )}
      </FormField>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Interest rate (%)" required>
          {(field) => (
            <input
              type="number"
              value={values.interestRate}
              onChange={(e) => onChange("interestRate", e.target.value)}
              placeholder="e.g. 7.125"
              min="0"
              max="25"
              step="0.001"
              className={MORTGAGE_INPUT_CLASS}
              data-testid="mortgage-interest-rate-input"
              {...field}
            />
          )}
        </FormField>

        <FormField label="Rate type" required>
          {(field) => (
            <select
              value={values.rateType}
              onChange={(e) => onChange("rateType", e.target.value)}
              className={MORTGAGE_INPUT_CLASS}
              required
              data-testid="mortgage-rate-type-select"
              {...field}
            >
              {/* No default. Whether the rate can move is the one thing this
                  feature cannot infer, and guessing "fixed" over an ARM would
                  compare it against a yardstick that does not apply to it. */}
              <option value="">Select…</option>
              <option value="fixed">Fixed for the life of the loan</option>
              <option value="arm">Adjustable (ARM)</option>
            </select>
          )}
        </FormField>
      </div>

      {isArm ? (
        <FormField label="Current rate runs until">
          {(field) => (
            <>
              <input
                type="date"
                value={values.fixedUntil}
                onChange={(e) => onChange("fixedUntil", e.target.value)}
                className={MORTGAGE_INPUT_CLASS}
                data-testid="mortgage-fixed-until-input"
                {...field}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                The date the rate can start moving. It&apos;s the deadline that
                actually matters on an ARM — printed on the statement as something
                like &ldquo;interest rate until February 2035&rdquo;.
              </p>
            </>
          )}
        </FormField>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Remaining balance (USD)">
          {(field) => (
            <input
              type="number"
              value={values.balanceDollars}
              onChange={(e) => onChange("balanceDollars", e.target.value)}
              placeholder="e.g. 336137.35"
              min="0"
              step="0.01"
              className={MORTGAGE_INPUT_CLASS}
              data-testid="mortgage-balance-input"
              {...field}
            />
          )}
        </FormField>

        <FormField label="As of (statement date)">
          {(field) => (
            <input
              type="date"
              value={values.statementDate}
              onChange={(e) => onChange("statementDate", e.target.value)}
              className={MORTGAGE_INPUT_CLASS}
              data-testid="mortgage-statement-date-input"
              {...field}
            />
          )}
        </FormField>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        A balance is only true as of a date, so these two are recorded together
        or not at all.
      </p>

      <div className="pt-2 border-t space-y-4">
        <p className="text-xs text-muted-foreground">
          How many payments are left — the difference between a rate gap and
          real money. Either the payoff date or the principal-and-interest split
          is enough; both is better.
        </p>

        <FormField label="Payoff date (maturity)">
          {(field) => (
            <input
              type="date"
              value={values.maturityDate}
              onChange={(e) => onChange("maturityDate", e.target.value)}
              className={MORTGAGE_INPUT_CLASS}
              data-testid="mortgage-maturity-date-input"
              {...field}
            />
          )}
        </FormField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Monthly principal (USD)">
            {(field) => (
              <input
                type="number"
                value={values.monthlyPrincipalDollars}
                onChange={(e) =>
                  onChange("monthlyPrincipalDollars", e.target.value)
                }
                placeholder="e.g. 301.56"
                min="0"
                step="0.01"
                className={MORTGAGE_INPUT_CLASS}
                data-testid="mortgage-monthly-principal-input"
                {...field}
              />
            )}
          </FormField>

          <FormField label="Monthly interest (USD)">
            {(field) => (
              <input
                type="number"
                value={values.monthlyInterestDollars}
                onChange={(e) =>
                  onChange("monthlyInterestDollars", e.target.value)
                }
                placeholder="e.g. 1995.82"
                min="0"
                step="0.01"
                className={MORTGAGE_INPUT_CLASS}
                data-testid="mortgage-monthly-interest-input"
                {...field}
              />
            )}
          </FormField>
        </div>

        {/* Escrow is captured but never compared. Taxes and insurance follow
            the property, not the loan, so a refinance does not change them —
            including escrow in the payment would show a saving that is not
            there. It is here because the statement prints one total and the
            operator should not have to subtract. */}
        <FormField label="Monthly escrow (USD)">
          {(field) => (
            <>
              <input
                type="number"
                value={values.monthlyEscrowDollars}
                onChange={(e) => onChange("monthlyEscrowDollars", e.target.value)}
                placeholder="e.g. 870.81"
                min="0"
                step="0.01"
                className={MORTGAGE_INPUT_CLASS}
                data-testid="mortgage-monthly-escrow-input"
                {...field}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Taxes and insurance. Recorded for your records but left out of the
                comparison — they follow the property, not the loan, so refinancing
                doesn&apos;t change them.
              </p>
            </>
          )}
        </FormField>
      </div>

      <div className="pt-2 border-t space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Original loan amount (USD)">
            {(field) => (
              <input
                type="number"
                value={values.originalPrincipalDollars}
                onChange={(e) =>
                  onChange("originalPrincipalDollars", e.target.value)
                }
                placeholder="e.g. 92050"
                min="0"
                step="0.01"
                className={MORTGAGE_INPUT_CLASS}
                data-testid="mortgage-original-principal-input"
                {...field}
              />
            )}
          </FormField>

          <FormField label="Original term (months)">
            {(field) => (
              <input
                type="number"
                value={values.termMonths}
                onChange={(e) => onChange("termMonths", e.target.value)}
                placeholder="e.g. 360"
                min="1"
                max="600"
                step="1"
                className={MORTGAGE_INPUT_CLASS}
                data-testid="mortgage-term-months-input"
                {...field}
              />
            )}
          </FormField>
        </div>

        <FormField label="Account number">
          {(field) => (
            <>
              <input
                type="text"
                value={values.accountNumber}
                onChange={(e) => onChange("accountNumber", e.target.value)}
                placeholder="e.g. 1395862051"
                className={MORTGAGE_INPUT_CLASS}
                maxLength={255}
                data-testid="mortgage-account-number-input"
                {...field}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Stored encrypted and masked in the audit log. Optional — nothing
                here needs it.
              </p>
            </>
          )}
        </FormField>

        <FormField label="Notes">
          {(field) => (
            <textarea
              value={values.notes}
              onChange={(e) => onChange("notes", e.target.value)}
              placeholder="Anything else worth remembering about this loan..."
              className={`${MORTGAGE_INPUT_CLASS} resize-none`}
              rows={3}
              maxLength={5000}
              data-testid="mortgage-notes-input"
              {...field}
            />
          )}
        </FormField>
      </div>
    </>
  );
}
