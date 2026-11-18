import { RESUME_UPLOAD_MIME_TYPES } from "@myjobhunter/api-client/constants/resumeUploadLimits";
import { useUploadResumeMutation } from "@myjobhunter/api-client/store/resumesApi";
import { resumeUploadProblem } from "@myjobhunter/api-client/utils/resumeUploadProblem";
import { isCancelledRequest } from "@platform/core/utils/isCancelledRequest";
import { isNoResponse } from "@platform/core/utils/isNoResponse";
import { discardFile, filePart, useToast, type FileForUpload } from "@platform/mobile";
import { useEffect, useRef, useState } from "react";
import { RESUME_MESSAGES as MESSAGES } from "../../constants/resume";
import { pickDocumentFile } from "../../lib/pickDocumentFile";
import { resumeUploadFailure } from "../../lib/resumeUploadFailure";
import type { ResumeUploadControls } from "../../types/ResumeUploadControls";

/**
 * The website's resume dropzone, as the phone's file picker: a PDF, DOCX or plain text file up to
 * 25 MB, checked before it's sent. The upload list refetches once it's in, and the server reads it.
 * Held by the start panel rather than its buttons: the empty state's button and "Upload another"
 * swap when a read finishes mid-upload, and a second picker must not open from the new one.
 * A file that never reached the server (no connection, or a timeout) is kept, so Retry sends it
 * again without picking it again; it's let go of when discarded, replaced, sent, or the screen is left.
 */
export function useResumeUpload(): ResumeUploadControls {
  const { showToast } = useToast();
  const [uploadResume] = useUploadResumeMutation();
  const [uploadedId, setUploadedId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [unsent, setUnsent] = useState<FileForUpload | null>(null);
  // The same file as `unsent`, readable from the unmount cleanup.
  const unsentRef = useRef<FileForUpload | null>(null);
  // State only blocks a second tap after a re-render. The ref blocks it immediately.
  const inFlight = useRef(false);

  useEffect(() => () => {
    if (unsentRef.current) discardFile(unsentRef.current.uri);
  }, []);

  function keep(file: FileForUpload | null): void {
    if (unsentRef.current && unsentRef.current !== file) discardFile(unsentRef.current.uri);
    unsentRef.current = file;
    setUnsent(file);
  }

  async function upload(): Promise<void> {
    await guarded(pickAndSend);
  }

  async function retry(): Promise<void> {
    const file = unsentRef.current;
    if (file) await guarded(() => send(file));
  }

  async function guarded(task: () => Promise<void>): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsUploading(true);
    try {
      await task();
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
    await send(file);
  }

  async function send(file: FileForUpload): Promise<void> {
    const form = new FormData();
    form.append("file", filePart(file));
    try {
      const job = await uploadResume(form).unwrap();
      keep(null);
      setUploadedId(job.id);
      showToast(MESSAGES.uploaded(file.name));
    } catch (error) {
      // Only a file the server never answered about is kept: any answer means sending it again won't change it.
      keep(isNoResponse(error) ? file : null);
      // A cache reset (sign-out, account change) called it off: there's nobody left to tell.
      if (!isCancelledRequest(error)) showToast(resumeUploadFailure(null, error), "error");
    }
  }

  return { upload, isUploading, uploadedId, unsentName: unsent?.name ?? null, retry, discardUnsent: () => keep(null) };
}
