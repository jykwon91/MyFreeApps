/** Override with EXPO_PUBLIC_API_BASE_URL to run against a local backend. */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://myjobhunter.myfreeapps.org/api";

/** The website: its links (the password reset, the email verification) and the page the captcha loads as. */
export const WEB_BASE_URL = process.env.EXPO_PUBLIC_WEB_BASE_URL ?? "https://myjobhunter.myfreeapps.org";

/**
 * The public Turnstile site key for forgot-password, the one the website's bundle ships
 * (MYJOBHUNTER_VITE_TURNSTILE_SITE_KEY). Set EXPO_PUBLIC_TURNSTILE_SITE_KEY to "" against a local backend
 * with no Turnstile secret, which skips the check.
 */
export const TURNSTILE_SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ?? "0x4AAAAAADJlzhOvYT8XzT7t";
