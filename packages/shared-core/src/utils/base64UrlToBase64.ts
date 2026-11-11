/** Turn base64url, as JWTs use, into the padded base64 that `atob` reads. */
export function base64UrlToBase64(base64Url: string): string {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  return base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
}
