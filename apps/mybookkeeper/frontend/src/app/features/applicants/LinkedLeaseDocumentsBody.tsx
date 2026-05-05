import type { LinkedLeaseDocumentsMode } from "@/shared/types/applicant/linked-lease-documents-mode";
import type { SignedLeaseAttachment } from "@/shared/types/lease/signed-lease-attachment";
import LinkedLeaseDocumentsEmpty from "./LinkedLeaseDocumentsEmpty";
import LinkedLeaseDocumentsList from "./LinkedLeaseDocumentsList";
import LinkedLeaseDocumentsLoading from "./LinkedLeaseDocumentsLoading";

export interface LinkedLeaseDocumentsBodyProps {
  mode: LinkedLeaseDocumentsMode;
  attachments: readonly SignedLeaseAttachment[];
  onPreview: (attachment: SignedLeaseAttachment) => void;
}

export default function LinkedLeaseDocumentsBody({
  mode,
  attachments,
  onPreview,
}: LinkedLeaseDocumentsBodyProps) {
  switch (mode) {
    case "loading":
      return <LinkedLeaseDocumentsLoading />;
    case "empty":
      return <LinkedLeaseDocumentsEmpty />;
    case "list":
      return <LinkedLeaseDocumentsList attachments={attachments} onPreview={onPreview} />;
  }
}
