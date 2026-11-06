/** A fresh id for one reply as written; the server uses it to never send that reply twice. */
export function newRequestId(): string {
  return crypto.randomUUID();
}
