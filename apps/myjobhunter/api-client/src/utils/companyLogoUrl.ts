import { safeLinkUrl } from "@platform/core/utils/safeLinkUrl";
import { WEB_LINK_SCHEMES } from "../constants/webLinkSchemes";

/** A company's logo address when it's http or https, or null so a placeholder shows instead. */
export function companyLogoUrl(url: string | null): string | null {
  return url === null ? null : safeLinkUrl(url, WEB_LINK_SCHEMES);
}
