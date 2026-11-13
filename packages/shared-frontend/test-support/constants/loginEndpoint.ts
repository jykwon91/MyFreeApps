import { DEFAULT_API_BASE } from "./defaultApiBase";

/** The shared sign-in route (platform_shared) the web login page posts to, as a page.route() glob. */
export const LOGIN_ENDPOINT = `**${DEFAULT_API_BASE}/auth/totp/login`;
