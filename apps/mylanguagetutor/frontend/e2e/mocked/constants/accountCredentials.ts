/** Credentials the sign-in and account specs type. Never real. */
import { unsignedJwt } from "@platform/ui/test-support/unsignedJwt";

export const TEST_PASSWORD = "correct-horse-battery";
export const WRONG_PASSWORD = "wrong-password-123";
export const TOTP_CODE = "123456";
/** What the stubbed login endpoint issues: a token the auth guard accepts. */
export const ISSUED_TOKEN = unsignedJwt();
