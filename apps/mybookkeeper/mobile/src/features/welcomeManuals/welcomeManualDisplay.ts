import type { WelcomeManualPlaceResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-place-response";
import type { WelcomeManualSummary } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-summary";
import { shareUrl } from "@mybookkeeper/api-client/utils/welcomeManualShare";
import { formatSectionCount, formatUpdatedAt } from "@mybookkeeper/api-client/utils/welcomeManualFormat";
import type { WelcomeManualSectionResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-section-response";
import { WEB_BASE_URL } from "../../constants/api";
import { WELCOME_MANUAL_MESSAGES as MESSAGES, countLabel } from "../../constants/welcomeManuals";

/** Blank rather than a wrong guess while the properties are still loading. */
export function manualPropertyName(
  propertyId: string | null,
  properties: readonly { id: string; name: string }[] | undefined,
): string | null {
  if (propertyId === null) return MESSAGES.noProperty;
  return properties?.find((property) => property.id === propertyId)?.name ?? null;
}

export function manualSummaryLine(manual: Pick<WelcomeManualSummary, "section_count" | "updated_at">): string {
  return `${formatSectionCount(manual.section_count)} · Updated ${formatUpdatedAt(manual.updated_at)}`;
}

export function manualRowLabel(manual: WelcomeManualSummary, propertyName: string | null): string {
  return [manual.title, propertyName, manualSummaryLine(manual), manual.section_count === 0 ? MESSAGES.noSectionsChip : null].filter(Boolean).join(", ");
}

export function manualShareLink(token: string): string {
  return shareUrl(WEB_BASE_URL, token);
}

export function manualShareMessage(token: string, pin: string | null): string {
  const link = `Here's your guide: ${manualShareLink(token)}`;
  return pin ? `${link}\nAccess code: ${pin}` : link;
}

export function placeLine(place: Pick<WelcomeManualPlaceResponse, "cuisine" | "price_tier">): string {
  return place.price_tier ? `${place.cuisine} · ${place.price_tier}` : place.cuisine;
}

export function placeMapLabel(placeName: string): string {
  return `Open ${placeName} on the map`;
}

export function sectionSummaryLine(section: Pick<WelcomeManualSectionResponse, "fields" | "images">): string {
  const parts = [countLabel(section.fields.length, "field", "fields"), countLabel(section.images.length, "photo", "photos")];
  return parts.join(" · ");
}
