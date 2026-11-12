// This package sees no platform's globals, so the DOM and React Native can't leak in.
// Web and the phone's Expo runtime both have these; only what the package uses is
// declared, and each consumer's own type is the one that applies, because this file
// loads only when the package checks itself.
declare class AbortSignal {
  readonly aborted: boolean;
}
declare class AbortController {
  readonly signal: AbortSignal;
  abort(): void;
}
declare class TextDecoder {
  decode(input?: Uint8Array, options?: { stream?: boolean }): string;
}
