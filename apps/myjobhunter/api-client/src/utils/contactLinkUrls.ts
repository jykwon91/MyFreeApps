import { safeLinkUrl } from "@platform/core/utils/safeLinkUrl";
import { isPlainEmailAddress } from "./isPlainEmailAddress";

/** A `mailto:` link for a contact's email, or null when it isn't one plain address a mail app can't read as more. */
export function contactEmailUrl(email: string): string | null {
  const address = email.trim();
  return isPlainEmailAddress(address) ? `mailto:${address}` : null;
}

/** A contact's LinkedIn link when it's http or https, or null so it shows as plain text. */
export function contactProfileUrl(url: string): string | null {
  return safeLinkUrl(url, ["http", "https"]);
}
