// scheme://[userinfo@]host[:port]... — read by hand because neither platform's URL can be relied
// on here: this package sees no DOM, and React Native's URL doesn't implement `hostname`.
const HOST_PATTERN = /^[a-z][a-z\d+.-]*:\/\/(?:[^/?#@]*@)?([^/?#:]+)/i;

/** "seriouseats.com" — the publisher when the model didn't name one. "" when it isn't a URL. */
export function hostLabel(url: string): string {
  const host = HOST_PATTERN.exec(url.trim())?.[1];
  return host ? host.toLowerCase().replace(/^www\./, "") : "";
}
