import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";
import {
  HOLDING_MAX_PRICE,
  HOLDING_MAX_QUANTITY,
  HOLDING_NAME_MAX_LENGTH,
  HOLDING_PRICE_MAX_DECIMALS,
  HOLDING_QUANTITY_MAX_DECIMALS,
  HOLDING_TICKER_PATTERN,
} from "../constants/securityTypes";
import type { Holding } from "../types/investments/holding";
import type { HoldingCreateRequest } from "../types/investments/holding-create-request";
import type { HoldingFormProblem } from "../types/investments/holding-form-problem";
import type { HoldingFormProblems } from "../types/investments/holding-form-problems";
import type { HoldingFormValues } from "../types/investments/holding-form-values";
import type { HoldingUpdateRequest } from "../types/investments/holding-update-request";
import { decimalPlaces, decimalText } from "./decimalText";
import { moneyTextToCents } from "./moneyTextToCents";

/**
 * Conversion between the holding form's text state and the API shape. Pure,
 * and shared by the add and edit dialogs. The rules mirror the backend's
 * ``holding_field_rules`` so a refusal shows on the field, not as a 422.
 */

export function emptyHoldingForm(financialAccountId: string): HoldingFormValues {
  return {
    financialAccountId,
    ticker: "",
    name: "",
    securityType: "equity",
    quantity: "",
    price: "",
    costBasis: "",
  };
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function tickerOrNull(value: string): string | null {
  const ticker = textOrNull(value);
  return ticker === null ? null : ticker.toUpperCase();
}

function numberProblem(
  text: string,
  decimalSeparator: DecimalSeparator,
  { allowZero, max, maxDecimals }: { allowZero: boolean; max: number; maxDecimals: number },
): HoldingFormProblem | undefined {
  const canonical = decimalText(text, decimalSeparator);
  if (canonical === "") return "required";
  if (canonical === undefined) return "not_a_number";
  const value = Number(canonical);
  if (allowZero ? value < 0 : value <= 0) return "must_be_positive";
  if (value > max) return "too_large";
  if (decimalPlaces(canonical) > maxDecimals) return "too_many_decimals";
  return undefined;
}

export function holdingFormProblems(
  values: HoldingFormValues,
  decimalSeparator: DecimalSeparator,
): HoldingFormProblems {
  const problems: HoldingFormProblems = {};
  if (values.financialAccountId === "") problems.financialAccountId = "account_required";
  const ticker = tickerOrNull(values.ticker);
  const name = textOrNull(values.name);
  if (ticker === null && name === null) problems.ticker = "ticker_or_name";
  else if (ticker !== null && !HOLDING_TICKER_PATTERN.test(ticker)) problems.ticker = "ticker_format";
  if (name !== null && name.length > HOLDING_NAME_MAX_LENGTH) problems.name = "name_too_long";
  const quantity = numberProblem(values.quantity, decimalSeparator, {
    allowZero: false, max: HOLDING_MAX_QUANTITY, maxDecimals: HOLDING_QUANTITY_MAX_DECIMALS,
  });
  if (quantity) problems.quantity = quantity;
  const price = numberProblem(values.price, decimalSeparator, {
    allowZero: true, max: HOLDING_MAX_PRICE, maxDecimals: HOLDING_PRICE_MAX_DECIMALS,
  });
  if (price) problems.price = price;
  if (moneyTextToCents(values.costBasis, decimalSeparator) === undefined) problems.costBasis = "not_a_number";
  return problems;
}

/** Form state to the POST body. Call only once ``holdingFormProblems`` is empty. */
export function toHoldingCreateRequest(
  values: HoldingFormValues,
  decimalSeparator: DecimalSeparator,
): HoldingCreateRequest {
  return {
    financial_account_id: values.financialAccountId,
    ticker_symbol: tickerOrNull(values.ticker),
    name: textOrNull(values.name),
    security_type: values.securityType,
    quantity: decimalText(values.quantity, decimalSeparator) ?? "",
    price: decimalText(values.price, decimalSeparator) ?? "",
    cost_basis_cents: moneyTextToCents(values.costBasis, decimalSeparator) ?? null,
  };
}

/**
 * Only the fields that changed, so an edit to the price alone doesn't resend
 * (and re-resolve) the ticker. Empty when nothing changed.
 */
export function toHoldingUpdateRequest(
  before: HoldingFormValues,
  after: HoldingFormValues,
  decimalSeparator: DecimalSeparator,
): HoldingUpdateRequest {
  const next = toHoldingCreateRequest(after, decimalSeparator);
  const prev = toHoldingCreateRequest(before, decimalSeparator);
  const update: HoldingUpdateRequest = {};
  if (next.ticker_symbol !== prev.ticker_symbol || next.name !== prev.name) {
    update.ticker_symbol = next.ticker_symbol;
    update.name = next.name;
  }
  if (next.security_type !== prev.security_type) update.security_type = next.security_type;
  if (Number(next.quantity) !== Number(prev.quantity)) update.quantity = next.quantity;
  if (Number(next.price) !== Number(prev.price)) update.price = next.price;
  if (next.cost_basis_cents !== prev.cost_basis_cents) update.cost_basis_cents = next.cost_basis_cents;
  return update;
}

/** A decimal string from the server ("10.5000000000") as the person would type it ("10.5"). */
export function trimDecimal(value: string | null): string {
  if (value === null) return "";
  return value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
}

export function holdingToFormValues(holding: Holding): HoldingFormValues {
  return {
    financialAccountId: holding.financial_account_id,
    ticker: holding.ticker_symbol ?? "",
    name: holding.name ?? "",
    securityType: holding.security_type,
    quantity: trimDecimal(holding.quantity),
    price: trimDecimal(holding.price),
    costBasis: holding.cost_basis_cents === null ? "" : String(holding.cost_basis_cents / 100),
  };
}
