export type SignInFailure =
  | "bad_credentials"
  | "not_verified"
  | "invalid_totp"
  | "rate_limited"
  | "unreachable"
  | "storage"
  | "unexpected";
