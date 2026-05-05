import { Badge } from "@platform/ui";
import type { DocumentKind } from "@/types/document/document-kind";
import { DOCUMENT_KIND_LABELS } from "@/features/documents/document-kind-labels";

const KIND_COLORS: Record<
  DocumentKind,
  "blue" | "green" | "yellow" | "purple" | "gray"
> = {
  cover_letter: "blue",
  tailored_resume: "green",
  job_description: "yellow",
  portfolio: "purple",
  other: "gray",
};

export interface DocumentKindBadgeProps {
  kind: DocumentKind;
}

export default function DocumentKindBadge({ kind }: DocumentKindBadgeProps) {
  return (
    <Badge
      label={DOCUMENT_KIND_LABELS[kind] ?? kind}
      color={KIND_COLORS[kind] ?? "gray"}
    />
  );
}
