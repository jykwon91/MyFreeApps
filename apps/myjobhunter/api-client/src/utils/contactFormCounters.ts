import {
  CONTACT_EMAIL_MAX_LENGTH,
  CONTACT_LINKEDIN_MAX_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
  CONTACT_NOTES_MAX_LENGTH,
} from "../constants/contactFieldLimits";
import type { CharacterCounters } from "../types/character-counters";
import type { ContactFormValues } from "../types/contact/contact-form-values";
import { countersFor } from "./countersFor";

export function contactFormCounters(values: ContactFormValues): CharacterCounters<keyof ContactFormValues> {
  return countersFor(values, {
    name: CONTACT_NAME_MAX_LENGTH,
    email: CONTACT_EMAIL_MAX_LENGTH,
    linkedin_url: CONTACT_LINKEDIN_MAX_LENGTH,
    notes: CONTACT_NOTES_MAX_LENGTH,
  });
}
