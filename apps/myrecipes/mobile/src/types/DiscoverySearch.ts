/**
 * The latest search, tagged with its request id so only its own answer is taken: one sent before
 * a newer search, or before an account change, is dropped.
 */
export type DiscoverySearch =
  | { status: "searching"; requestId: string; query: string; startedAt: number }
  | { status: "found"; requestId: string }
  | { status: "failed"; requestId: string; message: string };
