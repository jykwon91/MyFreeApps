import { StatusBadge } from "@platform/ui";
import type { BadgeTone } from "@platform/ui";
import type { DocumentKind } from "@myjobhunter/api-client/types/document/document-kind";
import { DOCUMENT_KIND_LABELS } from "@myjobhunter/api-client/constants/documentKindLabels";

const KIND_TONES: Record<DocumentKind, BadgeTone> = {
  cover_letter: "info",
  tailored_resume: "success",
  job_description: "warning",
  portfolio: "neutral",
  other: "neutral",
};

export interface DocumentKindBadgeProps {
  kind: DocumentKind;
}

export default function DocumentKindBadge({ kind }: DocumentKindBadgeProps) {
  return (
    <StatusBadge
      tone={KIND_TONES[kind] ?? "neutral"}
      label={DOCUMENT_KIND_LABELS[kind] ?? kind}
    />
  );
}
