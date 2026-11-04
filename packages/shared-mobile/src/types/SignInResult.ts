import type { SignInFailure } from "./SignInFailure";

export type SignInResult =
  | { outcome: "signedIn" }
  | { outcome: "totpRequired" }
  | { outcome: "failed"; failure: SignInFailure };
