import type { ContactRole } from "./contact-role";

/** What the add-contact form holds while someone fills it in. Blank text means "not given"; role is "" until one is picked. */
export interface ContactFormValues {
  name: string;
  email: string;
  linkedin_url: string;
  role: ContactRole | "";
  notes: string;
}
