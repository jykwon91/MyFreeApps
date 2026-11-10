import { toASCII } from "punycode";
import { URL } from "react-native-url-polyfill";

/**
 * A link's host, as the website reads it with the browser's `new URL(...).hostname`. React Native's
 * own URL can't parse, so this uses react-native-url-polyfill, which leaves an international name
 * as typed; punycode then encodes it the way a browser does (bücher.de → xn--bcher-kva.de).
 * Throws when the value isn't a URL, as the browser's does.
 */
export function urlHostname(url: string): string {
  return toASCII(new URL(url).hostname.normalize("NFC").toLowerCase());
}
