import type { AuthFormFailure } from "./AuthFormFailure";

/** `sent` means the server accepted the request, whether or not the address is registered. */
export type PasswordResetRequestResult = { outcome: "sent" } | { outcome: "failed"; failure: AuthFormFailure };
