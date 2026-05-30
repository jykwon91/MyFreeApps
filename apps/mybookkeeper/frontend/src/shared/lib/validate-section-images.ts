import {
  SECTION_IMAGE_ALLOWED_MIME,
  SECTION_IMAGE_MAX_BYTES,
} from "@/shared/lib/welcome-manual-constants";

export interface SectionImageValidationResult {
  valid: File[];
  rejected: string[];
}

/**
 * Client-side gate for section-image uploads. Mirrors ListingPhotoManager's
 * validator: size cap + JPEG/PNG/HEIC allowlist (HEIC also matched by
 * extension because some browsers don't set its content-type). The backend
 * re-validates and strips EXIF — this is a fast-fail UX layer only.
 */
export function validateSectionImages(files: File[]): SectionImageValidationResult {
  const valid: File[] = [];
  const rejected: string[] = [];
  for (const f of files) {
    if (f.size > SECTION_IMAGE_MAX_BYTES) {
      rejected.push(`${f.name} is over 10MB`);
      continue;
    }
    const isHeicByExt = /\.(heic|heif)$/i.test(f.name);
    if (!SECTION_IMAGE_ALLOWED_MIME.includes(f.type) && !isHeicByExt) {
      rejected.push(`${f.name} is not a supported image type`);
      continue;
    }
    valid.push(f);
  }
  return { valid, rejected };
}
