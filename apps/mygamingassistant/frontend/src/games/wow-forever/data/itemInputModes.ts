/** How an item gets into the compare page. Screenshot is the default. */
export const INPUT_MODE = {
  SCREENSHOT: "screenshot",
  TEXT: "text",
} as const;

export type InputMode = (typeof INPUT_MODE)[keyof typeof INPUT_MODE];
