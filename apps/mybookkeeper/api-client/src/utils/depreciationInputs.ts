import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";
import { DEPRECIATION_INPUT_MESSAGES } from "../constants/depreciationInputs";
import { MONEY_INPUT_MESSAGES } from "../constants/moneyInput";
import type { DepreciationInputChanges } from "../types/property/DepreciationInputChanges";
import type { Property } from "../types/property/property";
import type { PropertyClassification } from "../types/property/PropertyClassification";
import { normalizeMoneyText } from "./normalizeMoneyText";

/** Only a rental is depreciated (and so on Form 4562), so only a rental asks for these. */
export function showsDepreciationInputs(classification: PropertyClassification): boolean {
  return classification === "investment";
}

/**
 * Why the typed land value can't be saved, or undefined when it can. `purchasePrice` is the price
 * as it will be saved ("250000.00"), or null when there isn't one. Zero is fine: some homes carry
 * no separate land value.
 */
export function landValueProblem(
  text: string,
  purchasePrice: string | null,
  saved: string | null | undefined,
  decimalSeparator: DecimalSeparator,
): string | undefined {
  const amount = normalizeMoneyText(text, decimalSeparator);
  if (amount === undefined) return MONEY_INPUT_MESSAGES.notDollarsAndCents(decimalSeparator);
  if (amount === "") return saved != null ? DEPRECIATION_INPUT_MESSAGES.landValueRemoved : undefined;
  if (purchasePrice === null) return DEPRECIATION_INPUT_MESSAGES.landValueNeedsPrice;
  if (Number(amount) > Number(purchasePrice)) return DEPRECIATION_INPUT_MESSAGES.landValueOverPrice;
  return undefined;
}

/** Why the picked date placed in service can't be saved, or undefined when it can. Dates are YYYY-MM-DD. */
export function placedInServiceProblem(
  value: string | null,
  saved: string | null | undefined,
  todayIso: string,
): string | undefined {
  if (!value) return saved != null ? DEPRECIATION_INPUT_MESSAGES.placedInServiceRemoved : undefined;
  if (value > todayIso) return DEPRECIATION_INPUT_MESSAGES.placedInServiceInFuture;
  return undefined;
}

/**
 * The depreciation inputs that differ from what `property` has saved, ready for the update.
 * Call it once both pass their checks; blank (and unreadable) is left out.
 */
export function depreciationInputChanges(
  landValueText: string,
  placedInService: string | null,
  property: Pick<Property, "land_value" | "date_placed_in_service">,
  decimalSeparator: DecimalSeparator,
): DepreciationInputChanges {
  const changes: DepreciationInputChanges = {};
  const amount = normalizeMoneyText(landValueText, decimalSeparator);
  const savedLand = property.land_value == null ? null : Number(property.land_value);
  if (amount && Number(amount) !== savedLand) changes.land_value = Number(amount).toFixed(2);
  if (placedInService && placedInService !== property.date_placed_in_service) {
    changes.date_placed_in_service = placedInService;
  }
  return changes;
}
