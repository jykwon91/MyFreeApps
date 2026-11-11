// A fixed locale, so the website and the phone order the same whatever the device is set to.
// Ignores case and accents, and puts "Studio 9" before "Studio 10".
const COLLATOR = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** Orders two Companies-list values A to Z. */
export function compareCompanyText(a: string, b: string): number {
  return COLLATOR.compare(a, b);
}
