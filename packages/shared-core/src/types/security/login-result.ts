// The TOTP-enabled login flow is two-step: the first call returns
// `{ status: "totp_required" }`, and the second returns `{ status: "ok" }` with the
// JWT already in the token store.
export type LoginResult = { status: "ok" } | { status: "totp_required" };
