import {
  POLICY_CARRIER_MAX,
  POLICY_NAME_MAX,
  POLICY_NOTES_MAX,
  POLICY_NUMBER_MAX,
  WIND_HAIL_MAX_DECIMALS,
  WIND_HAIL_MAX_PCT,
} from "../constants/insurancePolicyFieldLimits";
import type { InsurancePolicyFormProblem } from "../types/insurance/insurance-policy-form-problem";
import type { InsurancePolicyFormProblems } from "../types/insurance/insurance-policy-form-problems";
import type { InsurancePolicyFormValues } from "../types/insurance/insurance-policy-form-values";
import { dollarsToCents } from "./dollarsToCents";
import { isPremiumBilledMissing } from "./insurancePolicyForm";

type MoneyField = "coverageDollars" | "feesAndTaxesDollars" | "deductibleDollars";

const NON_NEGATIVE_MONEY_FIELDS: readonly MoneyField[] = ["coverageDollars", "feesAndTaxesDollars", "deductibleDollars"];

const PLAIN_DECIMAL = /^-?(\d+\.?\d*|\.\d+)$/;

/** Checked on the cents that would be sent, since that is what the server sees. */
function moneyProblem(text: string, isOk: (cents: number) => boolean, failure: InsurancePolicyFormProblem): InsurancePolicyFormProblem | null {
  if (text.trim() === "") return null;
  const cents = dollarsToCents(text);
  if (cents === null) return "not_a_number";
  return isOk(cents) ? null : failure;
}

function windHailProblem(text: string): InsurancePolicyFormProblem | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (!PLAIN_DECIMAL.test(trimmed)) return "not_a_number";
  const value = Number(trimmed);
  if (!(value > 0 && value <= WIND_HAIL_MAX_PCT)) return "wind_hail_out_of_range";
  const decimals = (trimmed.split(".")[1] ?? "").replace(/0+$/, "");
  return decimals.length > WIND_HAIL_MAX_DECIMALS ? "wind_hail_decimals" : null;
}

/**
 * What the server would refuse, found before the request goes out.
 *
 * The same rules as the create and update schemas, applied to what the payload
 * would actually hold: a premium of 0.001 rounds to zero cents and is refused as
 * surely as a premium of 0. Blank is never a problem except for the name: every
 * other field is optional and a blank is sent as null, not 0.
 */
export function insurancePolicyFormProblems(values: InsurancePolicyFormValues): InsurancePolicyFormProblems {
  const problems: InsurancePolicyFormProblems = {};

  const name = values.policyName.trim();
  if (name === "") problems.policyName = "name_required";
  else if (name.length > POLICY_NAME_MAX) problems.policyName = "too_long";
  if (values.carrier.trim().length > POLICY_CARRIER_MAX) problems.carrier = "too_long";
  if (values.policyNumber.trim().length > POLICY_NUMBER_MAX) problems.policyNumber = "too_long";
  if (values.notes.trim().length > POLICY_NOTES_MAX) problems.notes = "too_long";

  for (const field of NON_NEGATIVE_MONEY_FIELDS) {
    const problem = moneyProblem(values[field], (cents) => cents >= 0, "negative");
    if (problem) problems[field] = problem;
  }

  const premium = moneyProblem(values.premiumDollars, (cents) => cents > 0, "must_be_positive");
  if (premium) problems.premiumDollars = premium;
  else if (isPremiumBilledMissing(values)) problems.premiumFrequency = "billed_required";

  const windHail = windHailProblem(values.windHailPct);
  if (windHail) problems.windHailPct = windHail;

  if (values.effectiveDate && values.expirationDate && values.expirationDate < values.effectiveDate) {
    problems.expirationDate = "dates_order";
  }
  return problems;
}
