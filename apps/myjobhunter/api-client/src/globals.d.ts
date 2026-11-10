// This package sees no platform's globals, so the DOM and React Native can't leak in.
// Both have a FormData; each consumer's own type is the one that applies, because
// this file loads only when the package checks itself.
declare class FormData {}
// Every platform has a console; only what the package uses is declared.
declare const console: { warn: (...data: unknown[]) => void };
