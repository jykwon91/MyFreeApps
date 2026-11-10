/** Most characters in the part before the @ (RFC 5321). */
const LOCAL_PART_MAX_LENGTH = 64;
/** Most characters in one dot-separated part of the domain (RFC 1035). */
const DOMAIN_LABEL_MAX_LENGTH = 63;
/** Characters a mail app could read as another header, recipient, scheme or escape (`%2C` is a comma). */
const LOCAL_PART_FORBIDDEN = /[\s@:/?#&,;<>%"\\]/;
/** Letters, digits and hyphens, or anything outside ASCII (internationalised domains). */
const DOMAIN_LABEL_PATTERN = /^[A-Za-z0-9\-\P{ASCII}]+$/u;
const ALL_DIGITS = /^\d+$/;

function isLocalPart(local: string): boolean {
  return (
    local.length >= 1 &&
    local.length <= LOCAL_PART_MAX_LENGTH &&
    !LOCAL_PART_FORBIDDEN.test(local) &&
    !local.startsWith(".") &&
    !local.endsWith(".") &&
    !local.includes("..")
  );
}

function isDomainLabel(label: string): boolean {
  return (
    label.length >= 1 &&
    label.length <= DOMAIN_LABEL_MAX_LENGTH &&
    DOMAIN_LABEL_PATTERN.test(label) &&
    !label.startsWith("-") &&
    !label.endsWith("-")
  );
}

/**
 * True for one plain address the backend's `EmailStr` takes and a `mailto:` can't turn into more:
 * a local part of 1–64 characters with no stray dots and no `%`, and a dotted domain of
 * 1–63-character labels that doesn't end in an all-digit label. The overall 254 limit is checked
 * separately, as `too_long`.
 */
export function isPlainEmailAddress(address: string): boolean {
  const at = address.indexOf("@");
  if (at < 0 || at !== address.lastIndexOf("@")) return false;
  const labels = address.slice(at + 1).split(".");
  const last = labels[labels.length - 1] ?? "";
  return isLocalPart(address.slice(0, at)) && labels.length >= 2 && labels.every(isDomainLabel) && !ALL_DIGITS.test(last);
}
