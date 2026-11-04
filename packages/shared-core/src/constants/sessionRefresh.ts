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
