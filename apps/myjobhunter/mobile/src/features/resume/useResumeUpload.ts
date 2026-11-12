import { RESUME_UPLOAD_MIME_TYPES } from "@myjobhunter/api-client/constants/resumeUploadLimits";
import { useUploadResumeMutation } from "@myjobhunter/api-client/store/resumesApi";
import { resumeUploadProblem } from "@myjobhunter/api-client/utils/resumeUploadProblem";
import { filePart, useToast, type FileForUpload } from "@platform/mobile";
import { useRef, useState } from "react";
import { RESUME_MESSAGES as MESSAGES } from "../../constants/resume";
import { pickDocumentFile } from "../../lib/pickDocumentFile";
import { resumeUploadFailure } from "../../lib/resumeUploadFailure";
import type { ResumeUploadControls } from "../../types/ResumeUploadControls";

/**
 * The website's resume dropzone, as the phone's file picker: a PDF, DOCX or plain text file up to
 * 25 MB, checked before it's sent. The upload list refetches once it's in, and the server reads it.
 * Held by the start panel rather than its buttons: the empty state's button and "Upload another"
 * swap when a read finishes mid-upload, and a second picker must not open from the new one.
 */
export function useResumeUpload(): ResumeUploadControls {
  const { showToast } = useToast();
  const [uploadResume] = useUploadResumeMutation();
  const [uploadedId, setUploadedId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  // State only blocks a second tap after a re-render. The ref blocks it immediately.
  const inFlight = useRef(false);

  async function upload(): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsUploading(true);
    try {
      await pickAndSend();
    } finally {
      inFlight.current = false;
      setIsUploading(false);
    }
  }

  async function pickAndSend(): Promise<void> {
    let file: FileForUpload | null;
    try {
      file = await pickDocumentFile(RESUME_UPLOAD_MIME_TYPES);
    } catch {
      showToast(MESSAGES.couldntPick, "error");
      return;
    }
    if (!file) return;
    const problem = resumeUploadProblem(file);
    if (problem) {
      showToast(resumeUploadFailure(problem), "error");
      return;
    }
    const form = new FormData();
    form.append("file", filePart(file));
    try {
      const job = await uploadResume(form).unwrap();
      setUploadedId(job.id);
      showToast(MESSAGES.uploaded(file.name));
    } catch (error) {
      showToast(resumeUploadFailure(null, error), "error");
    }
  }

  return { upload, isUploading, uploadedId };
}
