/** `Sam Lee <sam@acme.com>`, as mail apps copy an address with its name. */
const NAMED_ADDRESS = /^[^<>]*<([^<>]+)>$/;

/** The address someone typed or pasted, trimmed, without the `Name <…>` wrapping a mail app may add. */
export function extractEmailAddress(value: string): string {
  const trimmed = value.trim();
  const named = NAMED_ADDRESS.exec(trimmed);
  return named ? (named[1] ?? "").trim() : trimmed;
}
