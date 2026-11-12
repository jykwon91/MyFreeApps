/** How to re-encode a photo before it's uploaded. */
export interface PhotoEncoding {
  /** The longest edge, in pixels. A smaller photo isn't enlarged. */
  longestSide: number;
  /** JPEG quality, from 0 to 1. */
  quality: number;
}
