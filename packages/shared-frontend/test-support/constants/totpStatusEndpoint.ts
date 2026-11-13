import { DEFAULT_API_BASE } from "./defaultApiBase";

/** The shared 2FA status read the Security page makes, as a page.route() glob. */
export const TOTP_STATUS_ENDPOINT = `**${DEFAULT_API_BASE}/auth/totp/status`;
