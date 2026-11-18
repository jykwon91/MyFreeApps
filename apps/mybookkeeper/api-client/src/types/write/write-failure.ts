/**
 * Why a create, change or delete didn't go through, read from the status, and the demo refusal from its detail.
 * "serverError" is a 5xx that gave no reason, so like "noResponse" the write may have gone through; a 5xx with one is "other".
 */
export type WriteFailure = "noResponse" | "viewOnly" | "demo" | "gone" | "conflict" | "invalid" | "rateLimited" | "tooLarge" | "serverError" | "other";
