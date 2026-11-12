/** Override with EXPO_PUBLIC_API_BASE_URL to run against a local backend. */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://mylanguagetutor.myfreeapps.org/api";

/** Registration and password resets happen on the website. */
export const WEB_BASE_URL = process.env.EXPO_PUBLIC_WEB_BASE_URL ?? "https://mylanguagetutor.myfreeapps.org";
