/**
 * What to tell the operator when reading a form out of a document fails.
 *
 * The status is the only thing separating "shrink the file" from "wait until
 * tomorrow" from "the model could not make sense of it", and each needs a
 * different next move. A single "something went wrong" would leave someone
 * re-uploading the same 12MB scan until they gave up.
 *
 * Shared across every domain that reads a form out of a document — an
 * Electricity Facts Label and an insurance declarations page fail in exactly
 * the same four ways, and the advice does not depend on which one it was.
 */

/** Largest upload the backend accepts, mirrored from ``max_upload_size_bytes``. */
export const MAX_UPLOAD_MB = 10;

export function readDocumentErrorMessage(status: number | undefined): string {
  switch (status) {
    case 413:
      return `That file's too big for me — I can take up to ${MAX_UPLOAD_MB}MB. Try a smaller scan, or a photo at lower resolution.`;
    case 415:
      return "I can't read that kind of file. A PDF or a photo (JPG, PNG, or WEBP) works best.";
    case 429:
      return "That's as many documents as I can take today. Try again tomorrow, or fill the terms in by hand.";
    case 422:
      return "I couldn't read that one. Try another file, or fill it in by hand.";
    default:
      return "Something went wrong on my end. Try again, or fill it in by hand.";
  }
}
