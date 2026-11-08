import type { LinkPreviewPage } from "./LinkPreviewPage";
import type { LinkPreviewRoute } from "./LinkPreviewRoute";
import type { LinkPreviewSite } from "./LinkPreviewSite";

/** An app's link-preview tags: the defaults written into `index.html`, plus per-route pages. */
export interface LinkPreviewConfig {
  readonly site: LinkPreviewSite;
  /** The tags of the root `index.html`: the site root and every route not listed below. */
  readonly root: LinkPreviewPage;
  /** Routes that get their own `dist/<route>/index.html`. Unlisted routes keep the root tags. */
  readonly routes: readonly LinkPreviewRoute[];
}
