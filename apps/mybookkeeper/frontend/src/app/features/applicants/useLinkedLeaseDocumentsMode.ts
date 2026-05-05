import type { LinkedLeaseDocumentsMode } from "@/shared/types/applicant/linked-lease-documents-mode";
import type { SignedLeaseAttachment } from "@/shared/types/lease/signed-lease-attachment";

interface UseLinkedLeaseDocumentsModeArgs {
  isLoading: boolean;
  attachments: readonly SignedLeaseAttachment[];
}

/**
 * Resolves the render mode for LinkedLeaseDocumentsBody. Single source of
 * truth so the body component is a flat switch instead of a tower of
 * conditionals.
 */
export function useLinkedLeaseDocumentsMode({
  isLoading,
  attachments,
}: UseLinkedLeaseDocumentsModeArgs): LinkedLeaseDocumentsMode {
  if (isLoading) return "loading";
  if (!attachments.length) return "empty";
  return "list";
}
