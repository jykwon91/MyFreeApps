/** decodeURIComponent, or null for a malformed escape (an untrusted link can hold one). */
export function safeDecodeURIComponent(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}
