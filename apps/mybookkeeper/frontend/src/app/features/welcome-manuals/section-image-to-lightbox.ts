import type { ListingPhoto } from "@/shared/types/listing/listing-photo";
import type { WelcomeManualSectionImageResponse } from "@/shared/types/welcome-manual/welcome-manual-section-image-response";

/**
 * Adapt a section image to the shape `PhotoLightbox` consumes. The lightbox
 * only reads ``presigned_url`` and ``caption`` — the remaining fields are
 * populated for type-completeness so we can reuse the shared lightbox without
 * forking it for this domain.
 */
export function sectionImageToLightboxPhoto(
  image: WelcomeManualSectionImageResponse,
): ListingPhoto {
  return {
    id: image.id,
    listing_id: image.section_id,
    storage_key: image.storage_key,
    caption: image.caption,
    display_order: image.display_order,
    created_at: image.created_at,
    presigned_url: image.presigned_url,
    is_available: image.is_available,
  };
}
