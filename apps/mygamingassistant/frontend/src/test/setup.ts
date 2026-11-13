/**
 * Vitest global setup — registers @testing-library/jest-dom matchers
 * (`toBeInTheDocument`, `toBeEmptyDOMElement`, etc.) so they're available
 * in every test file without needing per-file imports.
 *
 * Mirrors apps/mybookkeeper/frontend/src/test/setup.ts.
 */
import "@testing-library/jest-dom/vitest";

// jsdom lacks pointer capture, which the shared Panel's phone drawer (vaul) calls. Same stubs as
// packages/shared-frontend/src/__tests__/setup.ts.
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};
Element.prototype.hasPointerCapture = () => false;

// jsdom has no matchMedia. Default to a phone-sized screen (max-width queries match, min-width ones don't);
// a test for wider screens stubs its own with vi.stubGlobal("matchMedia", ...).
if (typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: query.includes("max-width"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}
