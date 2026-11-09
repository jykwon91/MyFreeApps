/** Why a create, change or delete didn't go through, read from the status alone. */
export type WriteFailure = "noResponse" | "viewOnly" | "gone" | "conflict" | "invalid" | "serverError" | "other";
