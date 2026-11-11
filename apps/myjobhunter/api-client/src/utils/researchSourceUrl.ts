import { safeLinkUrl } from "@platform/core/utils/safeLinkUrl";
import type { ResearchSource } from "../types/research-source";

/**
 * A research source's address when it's http or https, or null so it shows as plain text. The
 * backend stores whatever the search returned, so a `javascript:`, `intent:` or app link never opens.
 */
export function researchSourceUrl(source: ResearchSource): string | null {
  return safeLinkUrl(source.url, ["http", "https"]);
}
