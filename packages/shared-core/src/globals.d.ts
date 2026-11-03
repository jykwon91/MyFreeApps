// This package sees no platform's globals, so the DOM and Node can't leak in. Timers
// are the exception: web and React Native both have them. This file loads only when
// the package checks itself.
declare function setTimeout(handler: () => void, delayMs?: number): unknown;
declare function clearTimeout(handle: unknown): void;
