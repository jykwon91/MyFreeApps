/**
 * Free text for a share link's fragment: percent-encoded, plus the characters
 * in `extraEscapes` (ones encodeURIComponent leaves alone that would break the
 * link's own split or a chat app's link detection). `extraEscapes` must be global.
 */
export function encodeLinkText(text: string, extraEscapes: RegExp): string {
  return encodeURIComponent(text).replace(extraEscapes, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
}
