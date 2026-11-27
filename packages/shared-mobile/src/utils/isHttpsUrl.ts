import { webOrigin } from "./webOrigin";

/** An https URL with a plain host, the only kind the captcha hands to the phone's browser. */
export function isHttpsUrl(url: string): boolean {
  return webOrigin(url)?.startsWith("https://") ?? false;
}
