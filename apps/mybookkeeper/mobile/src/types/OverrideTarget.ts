import type { TaxFieldOverrideValue } from "@mybookkeeper/api-client/types/tax/TaxFieldOverrideValue";

/** One field to override: the new value, tied to the field's type, and why. */
export type OverrideTarget = { fieldId: string; reason: string } & TaxFieldOverrideValue;
