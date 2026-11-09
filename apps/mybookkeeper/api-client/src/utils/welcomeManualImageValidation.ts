import { SECTION_IMAGE_ALLOWED_MIME, SECTION_IMAGE_MAX_BYTES } from "../constants/welcomeManualLimits";
import type { WelcomeManualImageCandidate } from "../types/welcome-manual/welcome-manual-image-candidate";
import type { WelcomeManualImageValidationResult } from "../types/welcome-manual/welcome-manual-image-validation-result";

/**
 * Client-side gate for section-image uploads: size cap plus a JPEG/PNG/HEIC allowlist (HEIC also
 * matched by extension because some browsers do not set its content-type). The backend
 * re-validates and strips EXIF; this is a fast-fail UX layer only. A file with no reported size or
 * type is let through for the server to judge.
 */
export function validateSectionImages<T extends WelcomeManualImageCandidate>(
  files: readonly T[],
): WelcomeManualImageValidationResult<T> {
  const valid: T[] = [];
  const rejected: string[] = [];
  for (const f of files) {
    if (typeof f.size === "number" && f.size > SECTION_IMAGE_MAX_BYTES) {
      rejected.push(`${f.name} is over 10MB`);
      continue;
    }
    const isHeicByExt = /\.(heic|heif)$/i.test(f.name);
    if (f.type && !SECTION_IMAGE_ALLOWED_MIME.includes(f.type) && !isHeicByExt) {
      rejected.push(`${f.name} is not a supported image type`);
      continue;
    }
    valid.push(f);
  }
  return { valid, rejected };
}
