import type { FieldErrors, Resolver } from "react-hook-form";
import type { ListingFormValues } from "@mybookkeeper/api-client/types/listing/listing-form-values";
import { listingFormProblems } from "@mybookkeeper/api-client/utils/listingForm";

/** react-hook-form's view of the shared listing rules, so the web and the phone check the same things. */
export const listingFormResolver: Resolver<ListingFormValues> = (values) => {
  const problems = listingFormProblems(values);
  const errors: FieldErrors<ListingFormValues> = {};
  for (const field of Object.keys(problems) as (keyof ListingFormValues)[]) {
    errors[field] = { type: "validate", message: problems[field] };
  }
  return Object.keys(errors).length > 0 ? { values: {}, errors } : { values, errors: {} };
};
