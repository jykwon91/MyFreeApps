/**
 * Vitest global setup — registers @testing-library/jest-dom matchers
 * (`toBeInTheDocument`, `toBeEmptyDOMElement`, etc.) so they're available
 * in every test file without needing per-file imports.
 *
 * Mirrors apps/mybookkeeper/frontend/src/test/setup.ts.
 */
import "@testing-library/jest-dom/vitest";
