import "@testing-library/jest-dom/vitest";

/**
 * jsdom does not implement `window.matchMedia`. Components that call
 * `useMediaQuery` (e.g. `Panel`, mobile-vs-desktop layout switches) will
 * blow up at mount without this polyfill.
 *
 * The shim returns a static `matches: false` so tests render the desktop
 * layout by default. Tests that need the mobile branch can override
 * `window.matchMedia` per-test.
 */
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList,
  });
}
