/** The part of a parsed query string that's read: `URLSearchParams` on the website and the phone. */
export interface QueryParams {
  get(name: string): string | null;
}
