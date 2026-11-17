/** Why a create, change or delete didn't go through, read from the status, and the demo refusal from its detail. */
export type WriteFailure = "noResponse" | "viewOnly" | "demo" | "gone" | "conflict" | "invalid" | "serverError" | "other";
