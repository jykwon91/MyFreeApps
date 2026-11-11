import { safeLinkUrl } from "@platform/core/utils/safeLinkUrl";
import { WEB_LINK_SCHEMES } from "../constants/webLinkSchemes";

/**
 * The posting an analysis read, when it's an http or https link that can be opened; otherwise null,
 * so it shows as plain text. Only the link the person typed is stored, but it is opened, so it's checked.
 */
export function jobAnalysisSourceUrl(sourceUrl: string | null): string | null {
  return sourceUrl === null ? null : safeLinkUrl(sourceUrl, WEB_LINK_SCHEMES);
}
