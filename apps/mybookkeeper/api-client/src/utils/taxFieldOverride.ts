import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";
import { TAX_FIELD_OVERRIDE_PROBLEMS } from "../constants/taxFieldOverride";
import { TAX_FIELD_LIMITS } from "../constants/taxFieldLimits";
import { PII_FIELDS } from "../constants/taxFormFields";
import type { FieldOverrideProblems } from "../types/tax/FieldOverrideProblems";
import type { FieldValueType } from "../types/tax/FieldValueType";
import type { OverrideFieldBody } from "../types/tax/OverrideFieldBody";
import type { OverrideFieldParams } from "../types/tax/OverrideFieldParams";
import type { TaxFieldOverrideValue } from "../types/tax/TaxFieldOverrideValue";
import type { TaxFormField } from "../types/tax/TaxFormField";
import { isMaskedTaxValue } from "./isMaskedTaxValue";
import { normalizeMoneyText } from "./normalizeMoneyText";

/** What people type around an amount: 1250, -5, $-5, -$5, +5 or (500) for a negative. The amount itself is read by normalizeMoneyText. */
const SIGNED_AMOUNT = /^(\()?([-+])?\$?([-+])?([\d.,]*)(\))?$/;
const TRUE_TEXTS = ["true", "1"];

/** What goes in the edit box to start with: the real value, never a hidden one. */
export function taxFieldEditText(field: Pick<TaxFormField, "field_id" | "type" | "value">): string {
  if (field.value == null || PII_FIELDS.has(field.field_id)) return "";
  if (field.type === "boolean") return field.value ? "true" : "false";
  const text = String(field.value);
  return isMaskedTaxValue(text) ? "" : text;
}

function readAmount(text: string, decimalSeparator: DecimalSeparator): number | null {
  const match = SIGNED_AMOUNT.exec(text.replace(/\s+/g, ""));
  if (!match) return null;
  const [, open, signBefore, signAfter, rawMagnitude, close] = match;
  if (Boolean(open) !== Boolean(close) || (signBefore && signAfter) || (open && (signBefore || signAfter))) return null;
  const magnitude = rawMagnitude.endsWith(decimalSeparator) ? rawMagnitude.slice(0, -1) : rawMagnitude;
  const normalized = normalizeMoneyText(magnitude, decimalSeparator);
  if (!normalized) return null;
  const [whole, cents] = normalized.split(".");
  const lastMark = /[.,](?=[^.,]*$)/.exec(magnitude)?.[0];
  if (cents !== undefined && lastMark !== decimalSeparator) return null;
  if (whole.length > TAX_FIELD_LIMITS.numericMaxDigits - TAX_FIELD_LIMITS.numericMaxDecimals) return null;
  const amount = Number(normalized);
  return open || signBefore === "-" || signAfter === "-" ? -amount : amount;
}

/**
 * The value an edit box holds, tied to its type, or null for "this isn't a value".
 * A blank number or text only counts as clearing the value when `allowBlank` says it was meant.
 */
export function parseTaxFieldOverride(type: FieldValueType, text: string, allowBlank: boolean, decimalSeparator: DecimalSeparator): TaxFieldOverrideValue | null {
  const trimmed = text.trim();
  if (type === "numeric") {
    if (trimmed === "") return allowBlank ? { field_type: "numeric", value: null } : null;
    const amount = readAmount(trimmed, decimalSeparator);
    return amount === null ? null : { field_type: "numeric", value: amount };
  }
  if (type === "boolean") {
    if (trimmed === "" && allowBlank) return { field_type: "boolean", value: null };
    return { field_type: "boolean", value: TRUE_TEXTS.includes(trimmed.toLowerCase()) };
  }
  if (trimmed === "") return allowBlank ? { field_type: "text", value: null } : null;
  if (isMaskedTaxValue(trimmed) || trimmed.length > TAX_FIELD_LIMITS.textMaxLength) return null;
  return { field_type: "text", value: trimmed };
}

function unreadableMessage(type: FieldValueType, text: string, decimalSeparator: DecimalSeparator): string {
  if (isMaskedTaxValue(text)) return TAX_FIELD_OVERRIDE_PROBLEMS.masked;
  if (type === "numeric") return TAX_FIELD_OVERRIDE_PROBLEMS.number(decimalSeparator);
  return text.trim().length > TAX_FIELD_LIMITS.textMaxLength ? TAX_FIELD_OVERRIDE_PROBLEMS.tooLong : TAX_FIELD_OVERRIDE_PROBLEMS.blank;
}

/** What's wrong with an override before it's sent: an unreadable or hidden value, or no reason given. */
export function taxFieldOverrideProblems(
  type: FieldValueType,
  text: string,
  reason: string,
  allowBlank: boolean,
  decimalSeparator: DecimalSeparator,
): FieldOverrideProblems {
  const problems: FieldOverrideProblems = {};
  if (parseTaxFieldOverride(type, text, allowBlank, decimalSeparator) === null) {
    problems.number = unreadableMessage(type, text, decimalSeparator);
  }
  if (reason.trim() === "") problems.reason = TAX_FIELD_OVERRIDE_PROBLEMS.reason;
  return problems;
}

/** The request body for an override: the value goes in the column that matches the field's type. */
export function overrideFieldBody(params: OverrideFieldParams): OverrideFieldBody {
  const { override_reason } = params;
  switch (params.field_type) {
    case "numeric": return { override_reason, value_numeric: params.value };
    case "boolean": return { override_reason, value_boolean: params.value };
    case "text": return { override_reason, value_text: params.value };
  }
}
