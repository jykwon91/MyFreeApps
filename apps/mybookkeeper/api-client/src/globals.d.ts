// This package sees no platform's globals, so the DOM and React Native can't leak in.
// Both have a FormData; each consumer's own type is the one that applies, because
// this file loads only when the package checks itself.
declare class FormData {}
// Timers exist on the web and in React Native alike.
declare function setTimeout(handler: () => void, ms: number): unknown;
