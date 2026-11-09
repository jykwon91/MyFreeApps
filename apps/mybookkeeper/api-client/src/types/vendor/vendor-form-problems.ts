import type { VendorFormValues } from "./vendor-form-values";

export type VendorFormProblems = Partial<Record<keyof VendorFormValues, string>>;
