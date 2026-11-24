import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";
import { FINANCIAL_ACCOUNT_MASK_PATTERN, FINANCIAL_ACCOUNT_TYPES, MORTGAGE_ACCOUNT_TYPE } from "../constants/financialAccountTypes";
import type { FinancialAccount } from "../types/financial-account/financial-account";
import type { FinancialAccountCreateRequest } from "../types/financial-account/financial-account-create-request";
import type { FinancialAccountFormProblems } from "../types/financial-account/financial-account-form-problems";
import type { FinancialAccountFormValues } from "../types/financial-account/financial-account-form-values";
import type { FinancialAccountType } from "../types/financial-account/financial-account-type";
import { moneyTextToCents } from "./moneyTextToCents";

/**
 * Conversion between the account form's text state and the API shape. Pure, and
 * shared by the add and edit dialogs so they agree on what a blank field means.
 */

export const EMPTY_FINANCIAL_ACCOUNT_FORM: FinancialAccountFormValues = {
  name: "",
  accountType: "",
  institutionName: "",
  mask: "",
  balanceDollars: "",
  balanceAsOf: "",
  mortgageId: "",
};

const LEADING_MINUS = /^\s*-\s*/;

export function isFinancialAccountType(value: string): value is FinancialAccountType {
  return FINANCIAL_ACCOUNT_TYPES.some((type) => type === value);
}

/**
 * Typed dollars as signed cents. Unlike an expense amount, a balance can be
 * below zero (an overdraft, a card in credit), so a leading minus is kept.
 * Null when blank, undefined when it can't be read for sure.
 */
export function balanceTextToCents(text: string, decimalSeparator: DecimalSeparator): number | null | undefined {
  const negative = LEADING_MINUS.test(text);
  const cents = moneyTextToCents(text.replace(LEADING_MINUS, ""), decimalSeparator);
  if (cents === null || cents === undefined) return cents;
  return negative ? -cents : cents;
}

export function centsToBalanceText(cents: number | null): string {
  return cents === null ? "" : String(cents / 100);
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function financialAccountFormProblems(
  values: FinancialAccountFormValues,
  decimalSeparator: DecimalSeparator,
): FinancialAccountFormProblems {
  const problems: FinancialAccountFormProblems = {};
  if (values.name.trim() === "") problems.name = "name_required";
  if (!isFinancialAccountType(values.accountType)) problems.accountType = "type_required";
  const mask = values.mask.trim();
  if (mask !== "" && !FINANCIAL_ACCOUNT_MASK_PATTERN.test(mask)) problems.mask = "mask_format";
  const cents = balanceTextToCents(values.balanceDollars, decimalSeparator);
  if (cents === undefined) problems.balanceDollars = "not_a_number";
  else if (cents !== null && values.balanceAsOf === "") problems.balanceAsOf = "needs_balance_date";
  return problems;
}

/**
 * Form state to the field set POST and PATCH both accept. Call only once
 * ``financialAccountFormProblems`` is empty. A mortgage link is dropped for any
 * other type rather than posted to fail, and an as-of date with no balance is
 * dropped too, so the pair always travels together.
 */
export function toFinancialAccountPayload(
  values: FinancialAccountFormValues,
  decimalSeparator: DecimalSeparator,
): FinancialAccountCreateRequest {
  const accountType = values.accountType as FinancialAccountType;
  const cents = balanceTextToCents(values.balanceDollars, decimalSeparator) ?? null;
  return {
    name: values.name.trim(),
    account_type: accountType,
    institution_name: textOrNull(values.institutionName),
    mask: textOrNull(values.mask),
    current_balance_cents: cents,
    balance_as_of: cents === null ? null : values.balanceAsOf,
    mortgage_id: accountType === MORTGAGE_ACCOUNT_TYPE ? textOrNull(values.mortgageId) : null,
  };
}

export function financialAccountToFormValues(account: FinancialAccount): FinancialAccountFormValues {
  return {
    name: account.name,
    accountType: account.account_type,
    institutionName: account.institution_name ?? "",
    mask: account.mask ?? "",
    balanceDollars: centsToBalanceText(account.current_balance_cents),
    balanceAsOf: account.balance_as_of ?? "",
    mortgageId: account.mortgage_id ?? "",
  };
}
