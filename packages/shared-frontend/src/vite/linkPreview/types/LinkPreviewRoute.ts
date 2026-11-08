import type { LinkPreviewPage } from "./LinkPreviewPage";

/** A client-side route that gets its own pre-rendered HTML file at build time. */
export interface LinkPreviewRoute extends LinkPreviewPage {
  /** A static route path: leading slash, no trailing slash, no `:params`, e.g. `/wow-forever/map`. */
  readonly path: string;
}
