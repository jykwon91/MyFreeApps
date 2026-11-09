import type { SignedLeaseTemplatePrefillItem } from "@mybookkeeper/api-client/types/lease/signed-lease-template-prefill";

/** Where asking the server what the chosen documents need has got to. */
export type PrefillState =
  | { status: "loading" }
  | { status: "ready"; items: SignedLeaseTemplatePrefillItem[] }
  | { status: "failed"; isGone: boolean };
