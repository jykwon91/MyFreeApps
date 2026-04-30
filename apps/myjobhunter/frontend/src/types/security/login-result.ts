// Discriminated result of `signIn` / `loginWithTotp` in `lib/auth.ts`.
// The TOTP-enabled login flow is two-step: the first call returns
// `{ status: "totp_required" }` and the second call returns
// `{ status: "ok" }` with the JWT already stashed in localStorage.
export type LoginResult = { status: "ok" } | { status: "totp_required" };
