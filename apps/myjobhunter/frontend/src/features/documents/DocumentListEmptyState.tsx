import { FileText } from "lucide-react";
import { EmptyState } from "@platform/ui";
import { DOCUMENTS_EMPTY_MESSAGES as MESSAGES } from "@/constants/documents-empty-messages";
import type { DocumentsEmptyKind } from "@/types/documents-empty-kind";

export interface DocumentListEmptyStateProps {
  kind: Exclude<DocumentsEmptyKind, "none">;
  forApplication: boolean;
  onClearFilter: () => void;
}

/** In a polite live region so a filter that finds nothing is announced, not just painted. */
export default function DocumentListEmptyState({ kind, forApplication, onClearFilter }: DocumentListEmptyStateProps) {
  const icon = <FileText className="w-12 h-12" />;
  return (
    <div role="status">
      {kind === "no-matches" ? (
        <EmptyState
          icon={icon}
          heading={MESSAGES.noMatchesHeading}
          body={MESSAGES.noMatchesBody}
          action={{ label: MESSAGES.clearFilter, onClick: onClearFilter }}
        />
      ) : (
        <EmptyState
          icon={icon}
          heading={MESSAGES.noDocumentsHeading}
          body={forApplication ? MESSAGES.noApplicationDocumentsBody : MESSAGES.noDocumentsBody}
        />
      )}
    </div>
  );
}
