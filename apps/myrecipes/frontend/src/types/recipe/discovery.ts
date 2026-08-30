/**
 * Web recipe discovery — the responses of POST /discovery/search and
 * POST /discovery/detail.
 *
 * Nothing here is persisted. Discovery searches the open web and returns
 * candidates to browse; only when the user saves does anything become a real
 * recipe, and that goes through the ordinary create flow (POST /recipes) with
 * `DiscoveredDetail.draft` as the seed.
 *
 * `SourceType` mirrors the backend `Literal` in
 * app/schemas/recipe/discovery_schemas.py — the two move together.
 */
import type { RecipeExtractionDraft } from "@/types/recipe/extraction";

export type DiscoverySourceType =
  | "website"
  | "youtube"
  | "reddit"
  | "blog"
  | "video"
  | "forum";

export type DiscoveryDifficulty = "easy" | "medium" | "hard";

export interface DiscoveredRecipe {
  /** Stable per-URL id — the list is keyed and routed on this, never on index. */
  id: string;
  title: string;
  source_type: DiscoverySourceType;
  site_name: string | null;
  url: string;
  /**
   * A path on OUR api (`/discovery/image?url=…&sig=…`), not a third-party URL:
   * the app's CSP is `img-src 'self'`, so thumbnails come through the backend.
   * Null when the result has no usable picture — render a placeholder tile.
   */
  image_url: string | null;
  summary: string;
  why_notable: string | null;
  total_minutes: number | null;
  difficulty: DiscoveryDifficulty | null;
}

export interface DiscoveryResults {
  query: string;
  recipes: DiscoveredRecipe[];
}

export interface DiscoveredDetail {
  title: string;
  source_type: DiscoverySourceType;
  site_name: string | null;
  url: string;
  image_url: string | null;
  summary: string;
  /** Same shape photo import produces, so it drops into the same editor. */
  draft: RecipeExtractionDraft;
  tips: string[];
  community_notes: string[];
  /** Pages actually read, for attribution. */
  sources: string[];
}
