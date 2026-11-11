/** A snake_case value as people read it ("phone_screen" → "Phone screen"), for one this client has no label for. */
export function humanizeKey(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ");
}
