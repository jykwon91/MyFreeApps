import { useState } from "react";
import { Check, FileDown } from "lucide-react";
import {
  LoadingButton,
  showError,
  showSuccess,
  extractErrorMessage,
} from "@platform/ui";
import api from "@/lib/api";
import { useCompleteRefinementSessionMutation } from "@myjobhunter/api-client/store/resumeRefinementApi";
import { ExportFormat } from "@myjobhunter/api-client/types/resume-refinement/export-format";
import { RESUME_EXPORT_MIME_TYPES } from "@myjobhunter/api-client/constants/resumeExportMimeTypes";
import { REFINEMENT_COMPLETION_COPY } from "@myjobhunter/api-client/constants/refinementCompletionCopy";
import { REFINEMENT_TOASTS } from "@myjobhunter/api-client/constants/refinementToasts";
import { refinementCompletion } from "@myjobhunter/api-client/utils/refinementCompletion";
import { resumeExportFileName } from "@myjobhunter/api-client/utils/resumeExportFileName";
import { resumeExportPath } from "@myjobhunter/api-client/utils/resumeExportPath";
import type { RefinementSession } from "@myjobhunter/api-client/types/resume-refinement/refinement-session";

interface CompletePanelProps {
  session: RefinementSession;
}

export default function CompletePanel({ session }: CompletePanelProps) {
  const completion = refinementCompletion(session);
  const isCompleted = completion === "completed";

  const [completeSession, { isLoading: isCompleting }] = useCompleteRefinementSessionMutation();
  const [downloading, setDownloading] = useState<ExportFormat | null>(null);

  if (completion === "hidden") {
    return null;
  }
  const { heading, body } = REFINEMENT_COMPLETION_COPY[completion];

  async function handleComplete() {
    try {
      await completeSession(session.id).unwrap();
      showSuccess(REFINEMENT_TOASTS.markedDone);
    } catch (err) {
      showError(extractErrorMessage(err));
    }
  }

  async function handleDownload(fmt: ExportFormat) {
    setDownloading(fmt);
    try {
      const response = await api.get(resumeExportPath(session.id, fmt), {
        responseType: "blob",
      });
      const blob = new Blob([response.data], { type: RESUME_EXPORT_MIME_TYPES[fmt] });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = resumeExportFileName(fmt);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      showError(extractErrorMessage(err));
    } finally {
      setDownloading(null);
    }
  }

  return (
    <section className="rounded-lg border border-emerald-300/50 bg-emerald-50 dark:bg-emerald-950/20 p-4 space-y-3">
      <header className="flex items-center gap-2">
        <Check className="size-5 text-emerald-600" />
        <h2 className="text-sm font-semibold">{heading}</h2>
      </header>
      <p className="text-sm text-muted-foreground">{body}</p>
      <div className="flex flex-wrap gap-2">
        {!isCompleted && (
          <LoadingButton isLoading={isCompleting} onClick={handleComplete}>
            Mark resume done
          </LoadingButton>
        )}
        {isCompleted && (
          <>
            <LoadingButton
              isLoading={downloading === ExportFormat.PDF}
              onClick={() => handleDownload(ExportFormat.PDF)}
            >
              <span className="inline-flex items-center gap-1.5">
                <FileDown size={14} /> Download PDF
              </span>
            </LoadingButton>
            <LoadingButton
              isLoading={downloading === ExportFormat.DOCX}
              onClick={() => handleDownload(ExportFormat.DOCX)}
            >
              <span className="inline-flex items-center gap-1.5">
                <FileDown size={14} /> Download DOCX
              </span>
            </LoadingButton>
          </>
        )}
      </div>
    </section>
  );
}
