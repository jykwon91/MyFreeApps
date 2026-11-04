const exemptPrefixes = new Set<string>();

/**
 * A 401 from these URLs means something other than an expired session, such as a
 * revoked third-party token or a wrong PIN, so it reaches the caller as a normal error.
 */
export function exemptFromSignOut(urlPrefixes: readonly string[]): void {
  urlPrefixes.forEach((prefix) => exemptPrefixes.add(prefix));
}

export function isExemptFromSignOut(url: string | undefined): boolean {
  if (!url) return false;
  return [...exemptPrefixes].some((prefix) => url.startsWith(prefix));
}
