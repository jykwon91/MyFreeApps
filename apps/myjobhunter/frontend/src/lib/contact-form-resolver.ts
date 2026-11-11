import type { FieldErrors, Resolver } from "react-hook-form";
import type { ContactFieldProblem } from "@myjobhunter/api-client/types/contact/contact-field-problem";
import type { ContactFormField } from "@myjobhunter/api-client/types/contact/contact-form-field";
import type { ContactFormValues } from "@myjobhunter/api-client/types/contact/contact-form-values";
import { contactFormErrors } from "@myjobhunter/api-client/utils/contactFormErrors";
import { hasContactFormErrors } from "@myjobhunter/api-client/utils/hasContactFormErrors";
import { CONTACT_FIELD_PROBLEM_MESSAGES } from "@/constants/contact-field-problem-messages";

/** Checks the add-contact form with the rules the phone uses too, worded for the website. */
export const contactFormResolver: Resolver<ContactFormValues> = (values) => {
  const problems = contactFormErrors(values);
  if (!hasContactFormErrors(problems)) return { values, errors: {} };
  const errors: FieldErrors<ContactFormValues> = {};
  for (const [field, problem] of Object.entries(problems) as [ContactFormField, ContactFieldProblem][]) {
    errors[field] = { type: problem, message: CONTACT_FIELD_PROBLEM_MESSAGES[field][problem] };
  }
  return { values: {}, errors };
};
