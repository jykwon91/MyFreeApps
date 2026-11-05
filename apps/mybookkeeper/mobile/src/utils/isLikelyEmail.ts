/** Catches typing slips. The server decides what's really an address. */
export function isLikelyEmail(text: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}
