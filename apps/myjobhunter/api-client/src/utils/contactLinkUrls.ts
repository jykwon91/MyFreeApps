import { safeLinkUrl } from "@platform/core/utils/safeLinkUrl";

/** One address, with nothing a mail app would read as more headers, recipients or a different scheme. */
const EMAIL_PATTERN = /^[^\s@:/?#&,;<>]+@[^\s@:/?#&,;<>]+\.[^\s@:/?#&,;<>]+$/;

/** A `mailto:` link for a contact's email, or null when it isn't a plain address. */
export function contactEmailUrl(email: string): string | null {
  const address = email.trim();
  return EMAIL_PATTERN.test(address) ? `mailto:${address}` : null;
}

/** A contact's LinkedIn link when it's http or https, or null so it shows as plain text. */
export function contactProfileUrl(url: string): string | null {
  return safeLinkUrl(url, ["http", "https"]);
}
