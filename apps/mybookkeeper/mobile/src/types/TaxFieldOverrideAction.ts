import type { TAX_FIELD_OVERRIDE_ACTION } from "../constants/taxFieldOverride";

export type TaxFieldOverrideAction = (typeof TAX_FIELD_OVERRIDE_ACTION)[keyof typeof TAX_FIELD_OVERRIDE_ACTION];
