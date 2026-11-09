import type { ListingFormValues } from "./listing-form-values";

/** The fields of a listing form whose value differs from the saved one. */
export type ListingFormDirty = Partial<Record<keyof ListingFormValues, boolean>>;
