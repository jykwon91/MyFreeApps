/**
 * The host of an absolute URL as the WHATWG URL parser gives it: lowercase, with an internationalised
 * name in its punycode form. Throws when the text isn't an absolute URL. The browser's `URL` is one;
 * React Native's `URL` has no `hostname`, so the phone supplies its own.
 */
export type UrlHostname = (url: string) => string;
