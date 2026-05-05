import { useState } from "react";
import { Plus } from "lucide-react";
import DocumentList from "@/features/documents/DocumentList";
import DocumentUploadDialog from "@/features/documents/DocumentUploadDialog";

export default function Documents() {
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Documents</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Cover letters, resumes, job descriptions, and more.
          </p>
        </div>
        <button
          onClick={() => setUploadOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm border rounded-md hover:bg-muted"
        >
          <Plus size={14} />
          Add document
        </button>
      </header>

      <DocumentList />

      <DocumentUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
      />
    </div>
  );
}
