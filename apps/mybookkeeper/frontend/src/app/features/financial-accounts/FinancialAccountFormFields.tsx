import { FieldFeedback, fieldFeedbackAria, FormField } from "@platform/ui";
import {
  FINANCIAL_ACCOUNT_INSTITUTION_MAX_LENGTH,
  FINANCIAL_ACCOUNT_MASK_MAX_LENGTH,
  FINANCIAL_ACCOUNT_NAME_MAX_LENGTH,
  MORTGAGE_ACCOUNT_TYPE,
} from "@mybookkeeper/api-client/constants/financialAccountTypes";
import type { FinancialAccountFormProblems } from "@mybookkeeper/api-client/types/financial-account/financial-account-form-problems";
import type { FinancialAccountFormValues } from "@mybookkeeper/api-client/types/financial-account/financial-account-form-values";
import { FINANCIAL_ACCOUNT_MESSAGES as MSG, FINANCIAL_ACCOUNT_PROBLEM_MESSAGES } from "@/shared/lib/financial-account-messages";
import FinancialAccountBalanceFields from "./FinancialAccountBalanceFields";
import FinancialAccountTypeSelect from "./FinancialAccountTypeSelect";
import MortgageLinkSelect from "./MortgageLinkSelect";
import { FINANCIAL_ACCOUNT_INPUT_CLASS } from "./financial-account-input-class";

export interface FinancialAccountFormFieldsProps {
  values: FinancialAccountFormValues;
  onChange: <K extends keyof FinancialAccountFormValues>(field: K, value: FinancialAccountFormValues[K]) => void;
  problems: FinancialAccountFormProblems;
}

/** Every field of the add and edit dialogs. */
export default function FinancialAccountFormFields({ values, onChange, problems }: FinancialAccountFormFieldsProps) {
  const nameError = problems.name && FINANCIAL_ACCOUNT_PROBLEM_MESSAGES[problems.name];
  const typeError = problems.accountType && FINANCIAL_ACCOUNT_PROBLEM_MESSAGES[problems.accountType];
  const maskError = problems.mask && FINANCIAL_ACCOUNT_PROBLEM_MESSAGES[problems.mask];

  return (
    <>
      <FormField label="Name" required>
        {(field) => (
          <>
            <input
              type="text"
              value={values.name}
              onChange={(e) => onChange("name", e.target.value)}
              maxLength={FINANCIAL_ACCOUNT_NAME_MAX_LENGTH}
              placeholder="e.g. Chase Checking"
              className={FINANCIAL_ACCOUNT_INPUT_CLASS}
              data-testid="financial-account-name-input"
              {...fieldFeedbackAria({ id: field.id, error: nameError })}
              {...field}
            />
            <FieldFeedback id={field.id} error={nameError} />
          </>
        )}
      </FormField>

      <FormField label="Kind of account" required>
        {(field) => (
          <>
            <FinancialAccountTypeSelect
              value={values.accountType}
              onChange={(value) => onChange("accountType", value)}
              field={field}
              ariaProps={fieldFeedbackAria({ id: field.id, error: typeError })}
            />
            <FieldFeedback id={field.id} error={typeError} />
          </>
        )}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Bank or institution">
          {(field) => (
            <input
              type="text"
              value={values.institutionName}
              onChange={(e) => onChange("institutionName", e.target.value)}
              maxLength={FINANCIAL_ACCOUNT_INSTITUTION_MAX_LENGTH}
              placeholder="e.g. Chase"
              className={FINANCIAL_ACCOUNT_INPUT_CLASS}
              data-testid="financial-account-institution-input"
              {...field}
            />
          )}
        </FormField>

        <FormField label="Last digits">
          {(field) => (
            <>
              <input
                type="text"
                inputMode="text"
                autoComplete="off"
                value={values.mask}
                onChange={(e) => onChange("mask", e.target.value)}
                maxLength={FINANCIAL_ACCOUNT_MASK_MAX_LENGTH}
                placeholder="4821"
                className={FINANCIAL_ACCOUNT_INPUT_CLASS}
                data-testid="financial-account-mask-input"
                {...fieldFeedbackAria({ id: field.id, error: maskError })}
                {...field}
              />
              <p className="text-xs text-muted-foreground mt-1">{MSG.maskHint}</p>
              <FieldFeedback id={field.id} error={maskError} />
            </>
          )}
        </FormField>
      </div>

      <FinancialAccountBalanceFields values={values} onChange={onChange} problems={problems} />

      {values.accountType === MORTGAGE_ACCOUNT_TYPE ? (
        <FormField label="Linked mortgage">
          {(field) => (
            <>
              <MortgageLinkSelect value={values.mortgageId} onChange={(value) => onChange("mortgageId", value)} field={field} />
              <p className="text-xs text-muted-foreground mt-1">{MSG.mortgageHint}</p>
            </>
          )}
        </FormField>
      ) : null}
    </>
  );
}
