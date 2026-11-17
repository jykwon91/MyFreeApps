/**
 * What a failed write carries, as the real server sends it: the app's own `detail` for a refusal, or the bare text an
 * unhandled crash answers with, which gives no reason (so the write may have saved before it broke).
 */
export function failedBody(status: number, detail: unknown = "nope"): unknown {
  return status >= 500 ? "Internal Server Error" : { detail };
}
