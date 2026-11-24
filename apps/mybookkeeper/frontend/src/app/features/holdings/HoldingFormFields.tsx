import { FieldFeedback, fieldFeedbackAria, FormField } from "@platform/ui";
import {
  HOLDING_NAME_MAX_LENGTH,
  HOLDING_TICKER_MAX_LENGTH,
  SECURITY_TYPE_LABELS,
  SECURITY_TYPES,
} from "@mybookkeeper/api-client/constants/securityTypes";
import type { FinancialAccount } from "@mybookkeeper/api-client/types/financial-account/financial-account";
import type { HoldingFormProblems } from "@mybookkeeper/api-client/types/investments/holding-form-problems";
import type { HoldingFormValues } from "@mybookkeeper/api-client/types/investments/holding-form-values";
import type { SecurityType } from "@mybookkeeper/api-client/types/investments/security-type";
import { FINANCIAL_ACCOUNT_INPUT_CLASS } from "@/app/features/financial-accounts/financial-account-input-class";
import { HOLDING_PROBLEM_MESSAGES as PROBLEM, HOLDINGS_MESSAGES as MSG } from "@/shared/lib/holdings-messages";
import HoldingTextField from "./HoldingTextField";

export interface HoldingFormFieldsProps {
  values: HoldingFormValues;
  onChange: <K extends keyof HoldingFormValues>(field: K, value: HoldingFormValues[K]) => void;
  problems: HoldingFormProblems;
  /** The accounts a holding can be added to; omitted when editing, since a holding stays in its account. */
  accounts?: FinancialAccount[];
}

function isSecurityType(value: string): value is SecurityType {
  return SECURITY_TYPES.some((type) => type === value);
}

/** Every field of the add and edit holding dialogs. */
export default function HoldingFormFields({ values, onChange, problems, accounts }: HoldingFormFieldsProps) {
  const accountError = problems.financialAccountId && PROBLEM[problems.financialAccountId];

  return (
    <>
      {accounts ? (
        <FormField label={MSG.fieldAccount} required>
          {(field) => (
            <>
              <select
                value={values.financialAccountId}
                onChange={(e) => onChange("financialAccountId", e.target.value)}
                className={FINANCIAL_ACCOUNT_INPUT_CLASS}
                data-testid="holding-account-select"
                {...fieldFeedbackAria({ id: field.id, error: accountError })}
                {...field}
              >
                <option value="">Select an account…</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">{MSG.balanceHint}</p>
              <FieldFeedback id={field.id} error={accountError} />
            </>
          )}
        </FormField>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <HoldingTextField
          label={MSG.fieldTicker}
          value={values.ticker}
          onChange={(value) => onChange("ticker", value)}
          maxLength={HOLDING_TICKER_MAX_LENGTH}
          placeholder="VTI"
          hint={MSG.tickerHint}
          error={problems.ticker && PROBLEM[problems.ticker]}
          testId="holding-ticker-input"
        />
        <HoldingTextField
          label={MSG.fieldName}
          value={values.name}
          onChange={(value) => onChange("name", value)}
          maxLength={HOLDING_NAME_MAX_LENGTH}
          placeholder="Vanguard Total Stock Market ETF"
          error={problems.name && PROBLEM[problems.name]}
          testId="holding-name-input"
        />
      </div>

      <FormField label={MSG.fieldType} required>
        {(field) => (
          <select
            value={values.securityType}
            onChange={(e) => {
              if (isSecurityType(e.target.value)) onChange("securityType", e.target.value);
            }}
            className={FINANCIAL_ACCOUNT_INPUT_CLASS}
            data-testid="holding-type-select"
            {...field}
          >
            {SECURITY_TYPES.map((type) => (
              <option key={type} value={type}>{SECURITY_TYPE_LABELS[type]}</option>
            ))}
          </select>
        )}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-3">
        <HoldingTextField
          label={MSG.fieldQuantity}
          value={values.quantity}
          onChange={(value) => onChange("quantity", value)}
          inputMode="decimal"
          placeholder="10.5"
          required
          error={problems.quantity && PROBLEM[problems.quantity]}
          testId="holding-quantity-input"
        />
        <HoldingTextField
          label={MSG.fieldPrice}
          value={values.price}
          onChange={(value) => onChange("price", value)}
          inputMode="decimal"
          placeholder="250.00"
          required
          error={problems.price && PROBLEM[problems.price]}
          testId="holding-price-input"
        />
        <HoldingTextField
          label={MSG.fieldCostBasis}
          value={values.costBasis}
          onChange={(value) => onChange("costBasis", value)}
          inputMode="decimal"
          placeholder="2000.00"
          hint={MSG.costBasisHint}
          error={problems.costBasis && PROBLEM[problems.costBasis]}
          testId="holding-cost-basis-input"
        />
      </div>
    </>
  );
}
