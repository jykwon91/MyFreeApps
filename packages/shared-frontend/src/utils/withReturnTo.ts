/**
 * `path` carrying `returnTo` as a query parameter, or `path` alone when there's
 * nowhere to return to. The sign-in and sign-up pages pass it between each other.
 */
export function withReturnTo(path: string, returnTo: string | null): string {
  return returnTo ? `${path}?returnTo=${encodeURIComponent(returnTo)}` : path;
}
