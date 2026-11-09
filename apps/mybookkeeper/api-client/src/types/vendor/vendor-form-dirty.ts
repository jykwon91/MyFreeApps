import type { VendorFormValues } from "./vendor-form-values";

export type VendorFormDirty = Partial<Record<keyof VendorFormValues, boolean>>;
