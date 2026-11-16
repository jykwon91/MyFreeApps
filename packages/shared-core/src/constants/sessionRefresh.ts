/** After a refresh gets no answer, requests that are rejected this soon don't try again. */
export const REFRESH_COOLDOWN_MS = 5000;

/** Answering a 401 from these with a refresh would loop or hide a wrong password. */
export const NO_REFRESH_URL_PARTS = [
  "/auth/jwt/login",
  "/auth/totp/login",
  "/auth/mobile/login",
  "/auth/mobile/refresh",
  "/auth/mobile/logout",
];

/** A request refused with a 401 whose sign-in couldn't be renewed because the server didn't answer. */
export const SESSION_RENEWAL_UNREACHABLE_MESSAGE = "Couldn't reach the server to renew the sign-in.";
