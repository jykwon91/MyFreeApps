/**
 * Documents section of the ApplicationDrawer.
 *
 * Wraps the existing DocumentList + DocumentUploadDialog. The drawer
 * already constrains screen real estate so the kind filter is hidden
 * (parent context — application — is already filtering).
 */
import { useState } from "react";
import { Plus } from "lucide-react";
import DocumentList from "@/features/documents/DocumentList";
import DocumentUploadDialog from "@/features/documents/DocumentUploadDialog";

interface DocumentsSectionProps {
  applicationId: string;
}

export default function DocumentsSection({ applicationId }: DocumentsSectionProps) {
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <section>
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium">Documents</h2>
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-md hover:bg-muted"
        >
          <Plus size={12} />
          Add document
        </button>
      </header>
      <DocumentList applicationId={applicationId} hideKindFilter />
      <DocumentUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        applicationId={applicationId}
      />
    </section>
  );
}
