import type { ListingFormValues } from "./listing-form-values";

/** What is wrong with each field of a listing form, by field. */
export type ListingFormProblems = Partial<Record<keyof ListingFormValues, string>>;
