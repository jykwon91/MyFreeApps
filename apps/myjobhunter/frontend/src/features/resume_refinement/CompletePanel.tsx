import { useState } from "react";
import { Check, FileDown } from "lucide-react";
import {
  LoadingButton,
  showError,
  showSuccess,
  extractErrorMessage,
} from "@platform/ui";
import api from "@/lib/api";
import { useCompleteRefinementSessionMutation } from "@/lib/resumeRefinementApi";
import type { RefinementSession } from "@/types/resume-refinement/refinement-session";

interface CompletePanelProps {
  session: RefinementSession;
}

export default function CompletePanel({ session }: CompletePanelProps) {
  const targets = session.improvement_targets ?? [];
  const reachedEnd = session.target_index >= targets.length;
  const isCompleted = session.status === "completed";

  const [completeSession, { isLoading: isCompleting }] = useCompleteRefinementSessionMutation();
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);

  if (!reachedEnd && !isCompleted) {
    return null;
  }

  async function handleComplete() {
    try {
      await completeSession(session.id).unwrap();
      showSuccess("Resume marked done. Download a copy below.");
    } catch (err) {
      showError(extractErrorMessage(err));
    }
  }

  async function handleDownload(fmt: "pdf" | "docx") {
    setDownloading(fmt);
    try {
      const response = await api.get(
        `/resume-refinement/sessions/${session.id}/export`,
        {
          params: { format: fmt },
          responseType: "blob",
        }
      );
      const blob = new Blob([response.data], {
        type:
          fmt === "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `resume.${fmt}`;
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
        <h2 className="text-sm font-semibold">
          {isCompleted ? "All done" : "All targets reviewed"}
        </h2>
      </header>
      <p className="text-sm text-muted-foreground">
        {isCompleted
          ? "Your refined resume is ready to download in either format."
          : "You've gone through every suggestion. Mark the session done to lock the draft, then download."}
      </p>
      <div className="flex flex-wrap gap-2">
        {!isCompleted && (
          <LoadingButton isLoading={isCompleting} onClick={handleComplete}>
            Mark resume done
          </LoadingButton>
        )}
        {isCompleted && (
          <>
            <LoadingButton
              isLoading={downloading === "pdf"}
              onClick={() => handleDownload("pdf")}
            >
              <span className="inline-flex items-center gap-1.5">
                <FileDown size={14} /> Download PDF
              </span>
            </LoadingButton>
            <LoadingButton
              isLoading={downloading === "docx"}
              onClick={() => handleDownload("docx")}
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
