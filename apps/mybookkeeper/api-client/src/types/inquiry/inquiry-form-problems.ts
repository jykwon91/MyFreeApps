import type { InquiryFormValues } from "./inquiry-form-values";

/** What's wrong with each field of the add-inquiry form. Empty when it can be sent. */
export type InquiryFormProblems = Partial<Record<keyof InquiryFormValues, string>>;
