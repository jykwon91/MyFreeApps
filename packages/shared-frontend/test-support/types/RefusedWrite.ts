/**
 * How a stubbed endpoint refuses a write: an HTTP status with the server's
 * `detail` (a JSON `{detail}` body, as an HTTPException sends it), or with a
 * plain-text body (as an unhandled error's 500 arrives).
 */
export type RefusedWrite = { status: number; detail: string } | { status: number; plainText: string };
