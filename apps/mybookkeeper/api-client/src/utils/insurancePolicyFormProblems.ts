import {
  POLICY_CARRIER_MAX,
  POLICY_NAME_MAX,
  POLICY_NOTES_MAX,
  POLICY_NUMBER_MAX,
  WIND_HAIL_MAX_DECIMALS,
  WIND_HAIL_MAX_PCT,
} from "../constants/insurancePolicyFieldLimits";
import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";
import type { InsurancePolicyFormProblem } from "../types/insurance/insurance-policy-form-problem";
import type { InsurancePolicyFormProblems } from "../types/insurance/insurance-policy-form-problems";
import type { InsurancePolicyFormValues } from "../types/insurance/insurance-policy-form-values";
import { isPremiumBilledMissing } from "./insurancePolicyForm";
import { isNegativeMoneyText, moneyTextToCents } from "./moneyTextToCents";
import { normalizeDecimalText } from "./normalizeDecimalText";

type MoneyField = "coverageDollars" | "feesAndTaxesDollars" | "deductibleDollars";

const NON_NEGATIVE_MONEY_FIELDS: readonly MoneyField[] = ["coverageDollars", "feesAndTaxesDollars", "deductibleDollars"];

/** Checked on the cents that would be sent, since that is what the server sees. */
function moneyProblem(
  text: string,
  decimalSeparator: DecimalSeparator,
  isOk: (cents: number) => boolean,
  failure: InsurancePolicyFormProblem,
): InsurancePolicyFormProblem | null {
  const cents = moneyTextToCents(text, decimalSeparator);
  if (cents === null) return null;
  if (cents === undefined) return isNegativeMoneyText(text, decimalSeparator) ? failure : "not_a_number";
  return isOk(cents) ? null : failure;
}

/** "-2,5": a number, just not one above zero, so it's out of range rather than unreadable. */
function isNegativeNumber(text: string, decimalSeparator: DecimalSeparator): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("-") && Boolean(normalizeDecimalText(trimmed.slice(1), decimalSeparator));
}

/** Read as `toPolicyPayload` reads it, so the percentage checked is the one sent. */
function windHailProblem(text: string, decimalSeparator: DecimalSeparator): InsurancePolicyFormProblem | null {
  const typed = normalizeDecimalText(text, decimalSeparator);
  if (typed === "") return null;
  if (typed === undefined) return isNegativeNumber(text, decimalSeparator) ? "wind_hail_out_of_range" : "not_a_number";
  const value = Number(typed);
  if (!(value > 0 && value <= WIND_HAIL_MAX_PCT)) return "wind_hail_out_of_range";
  return normalizeDecimalText(text, decimalSeparator, WIND_HAIL_MAX_DECIMALS) === undefined ? "wind_hail_decimals" : null;
}

/**
 * What the server would refuse, found before the request goes out.
 *
 * The same rules as the create and update schemas, applied to what the payload
 * would actually hold: a premium of 0.001 rounds to zero cents and is refused as
 * surely as a premium of 0. Blank is never a problem except for the name: every
 * other field is optional and a blank is sent as null, not 0.
 */
export function insurancePolicyFormProblems(values: InsurancePolicyFormValues, decimalSeparator: DecimalSeparator): InsurancePolicyFormProblems {
  const problems: InsurancePolicyFormProblems = {};

  const name = values.policyName.trim();
  if (name === "") problems.policyName = "name_required";
  else if (name.length > POLICY_NAME_MAX) problems.policyName = "too_long";
  if (values.carrier.trim().length > POLICY_CARRIER_MAX) problems.carrier = "too_long";
  if (values.policyNumber.trim().length > POLICY_NUMBER_MAX) problems.policyNumber = "too_long";
  if (values.notes.trim().length > POLICY_NOTES_MAX) problems.notes = "too_long";

  for (const field of NON_NEGATIVE_MONEY_FIELDS) {
    const problem = moneyProblem(values[field], decimalSeparator, (cents) => cents >= 0, "negative");
    if (problem) problems[field] = problem;
  }

  const premium = moneyProblem(values.premiumDollars, decimalSeparator, (cents) => cents > 0, "must_be_positive");
  if (premium) problems.premiumDollars = premium;
  else if (isPremiumBilledMissing(values, decimalSeparator)) problems.premiumFrequency = "billed_required";

  const windHail = windHailProblem(values.windHailPct, decimalSeparator);
  if (windHail) problems.windHailPct = windHail;

  if (values.effectiveDate && values.expirationDate && values.expirationDate < values.effectiveDate) {
    problems.expirationDate = "dates_order";
  }
  return problems;
}
