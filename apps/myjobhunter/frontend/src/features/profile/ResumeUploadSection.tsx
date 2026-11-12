import { useState } from "react";
import { FileText } from "lucide-react";
import { FileUploadDropzone, showError, showSuccess, extractErrorMessage } from "@platform/ui";
import { aiActionErrorMessage } from "@/lib/aiActionErrorMessage";
import ResumeJobRow from "@/features/profile/ResumeJobRow";
import ResumeUploadSectionSkeleton from "@/features/profile/ResumeUploadSectionSkeleton";
import {
  useUploadResumeMutation,
  useListResumeJobsQuery,
  useLazyGetResumeDownloadUrlQuery,
} from "@myjobhunter/api-client/store/resumesApi";
import { RESUME_JOBS_POLL_INTERVAL_MS } from "@myjobhunter/api-client/constants/resumeJobsPolling";
import {
  RESUME_UPLOAD_EXTENSIONS,
  RESUME_UPLOAD_MAX_BYTES,
  RESUME_UPLOAD_MIME_TYPES,
} from "@myjobhunter/api-client/constants/resumeUploadLimits";

// Every resume type, by content type and by extension, so the browser's picker offers them all.
const ACCEPTED_RESUME_TYPES = [...RESUME_UPLOAD_MIME_TYPES, ...RESUME_UPLOAD_EXTENSIONS].join(",");

export interface ResumeUploadSectionProps {
  profileId: string;
}

export default function ResumeUploadSection({ profileId: _profileId }: ResumeUploadSectionProps) {
  // Re-read every few seconds while mounted, so a row moves from queued to complete without a
  // refresh; RTK Query stops the timer on unmount.
  const { data: jobs, isLoading } = useListResumeJobsQuery(undefined, {
    pollingInterval: RESUME_JOBS_POLL_INTERVAL_MS,
  });

  const [uploadResume, { isLoading: isUploading }] = useUploadResumeMutation();
  const [getDownloadUrl] = useLazyGetResumeDownloadUrlQuery();
  const [downloadingJobId, setDownloadingJobId] = useState<string | null>(null);

  if (isLoading) {
    return <ResumeUploadSectionSkeleton />;
  }

  async function handleFilesSelected(files: File[]) {
    const file = files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      await uploadResume(formData).unwrap();
      showSuccess(`"${file.name}" uploaded and queued for processing`);
    } catch (err) {
      showError(aiActionErrorMessage(err, "resumeUpload", "Upload failed: "));
    }
  }

  async function handleDownload(jobId: string) {
    setDownloadingJobId(jobId);
    try {
      const result = await getDownloadUrl(jobId).unwrap();
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      showError(`Download failed: ${extractErrorMessage(err)}`);
    } finally {
      setDownloadingJobId(null);
    }
  }

  const jobList = jobs ?? [];

  return (
    <section className="border rounded-lg p-6 space-y-4">
      <div className="flex items-center gap-2">
        <FileText size={16} className="text-muted-foreground" />
        <h2 className="font-semibold">Resume</h2>
      </div>

      <FileUploadDropzone
        onFilesSelected={(files) => void handleFilesSelected(files)}
        accept={ACCEPTED_RESUME_TYPES}
        maxSizeBytes={RESUME_UPLOAD_MAX_BYTES}
        uploading={isUploading}
        label="Drop your resume here or click to browse"
        helperText="PDF, DOCX, or plain text · max 25 MB"
      />

      {jobList.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No resumes uploaded yet</p>
      ) : (
        <div className="divide-y">
          {jobList.map((job) => (
            <ResumeJobRow
              key={job.id}
              job={job}
              onDownload={handleDownload}
              isDownloading={downloadingJobId === job.id}
            />
          ))}
        </div>
      )}
    </section>
  );
}
