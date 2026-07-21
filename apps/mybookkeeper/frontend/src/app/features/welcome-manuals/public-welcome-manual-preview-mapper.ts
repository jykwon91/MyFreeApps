import type { PublicWelcomeManualPlace } from "@/shared/types/welcome-manual/public-welcome-manual-place";
import type { PublicWelcomeManualSection } from "@/shared/types/welcome-manual/public-welcome-manual-section";
import type { WelcomeManualPlaceResponse } from "@/shared/types/welcome-manual/welcome-manual-place-response";
import type { WelcomeManualSectionResponse } from "@/shared/types/welcome-manual/welcome-manual-section-response";

/**
 * The public guide endpoint returns a trimmed shape (no ids, manual/section
 * parent ids, or timestamps — a guest never needs them). These mappers pad
 * that trimmed shape back out to the full admin response types so the guest
 * page can reuse `WelcomeManualPreview` unmodified. Synthesized ids/orders
 * are index-based and only used as React keys / prop values the preview
 * doesn't otherwise interpret.
 */
export function mapPublicSectionsToPreview(
  sections: PublicWelcomeManualSection[],
): WelcomeManualSectionResponse[] {
  return sections.map((section, sectionIndex) => {
    const sectionId = `section-${sectionIndex}`;
    return {
      id: sectionId,
      manual_id: "public",
      title: section.title,
      body: section.body,
      display_order: sectionIndex,
      fields: section.fields.map((field, fieldIndex) => ({
        id: `${sectionId}-field-${fieldIndex}`,
        section_id: sectionId,
        label: field.label,
        value: field.value,
        display_order: fieldIndex,
        created_at: "",
      })),
      images: section.images.map((image) => ({
        id: image.id,
        section_id: sectionId,
        storage_key: "",
        caption: image.caption,
        display_order: image.display_order,
        created_at: "",
        presigned_url: image.presigned_url,
        is_available: image.is_available,
      })),
      created_at: "",
      updated_at: "",
    };
  });
}

export function mapPublicPlacesToPreview(
  places: PublicWelcomeManualPlace[],
): WelcomeManualPlaceResponse[] {
  return places.map((place, index) => ({
    id: `place-${index}`,
    manual_id: "public",
    name: place.name,
    cuisine: place.cuisine,
    price_tier: place.price_tier,
    note: place.note,
    map_url: place.map_url,
    display_order: place.display_order,
    created_at: "",
  }));
}
