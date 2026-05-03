import type { LeaseAttachmentKind } from "@/shared/types/lease/lease-attachment-kind";

/**
 * Infers a lease attachment kind from a filename.
 *
 * Mirrors the backend logic in ``signed_lease_service.infer_kind_from_filename``.
 * Keep both in sync when changing heuristics.
 *
 * Order of evaluation (case-insensitive):
 * 1. "move-in inspection" / "move in inspection" → move_in_inspection
 * 2. "move-out inspection" / "move out inspection" → move_out_inspection
 * 3. "lease agreement" / "master lease" / "rental agreement" → signed_lease
 * 4. "inspection" (without "move") → move_in_inspection
 * 5. "insurance" → insurance_proof
 * 6. Everything else → signed_addendum
 */
export function inferKindFromFilename(filename: string): LeaseAttachmentKind {
  const lower = filename.toLowerCase();

  if (lower.includes("move-in inspection") || lower.includes("move in inspection")) {
    return "move_in_inspection";
  }
  if (lower.includes("move-out inspection") || lower.includes("move out inspection")) {
    return "move_out_inspection";
  }
  if (
    lower.includes("lease agreement") ||
    lower.includes("master lease") ||
    lower.includes("rental agreement")
  ) {
    return "signed_lease";
  }
  if (lower.includes("inspection")) {
    return "move_in_inspection";
  }
  if (lower.includes("insurance")) {
    return "insurance_proof";
  }

  return "signed_addendum";
}

/**
 * Infers kinds for a batch of files.
 *
 * If none of the filenames pattern-match to ``signed_lease``, the first file
 * is promoted to ``signed_lease`` as a last-resort fallback — at least one
 * file must be the main lease.
 */
export function inferKindsForFiles(filenames: string[]): LeaseAttachmentKind[] {
  const kinds = filenames.map((name) => inferKindFromFilename(name));
  if (!kinds.includes("signed_lease") && kinds.length > 0) {
    kinds[0] = "signed_lease";
  }
  return kinds;
}
