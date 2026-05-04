import { FileText } from "lucide-react";
import { FileUploadDropzone, showError, showSuccess, extractErrorMessage } from "@platform/ui";
import ResumeJobRow from "@/features/profile/ResumeJobRow";
import ResumeUploadSectionSkeleton from "@/features/profile/ResumeUploadSectionSkeleton";
import {
  useUploadResumeMutation,
  useListResumeJobsQuery,
  useGetResumeDownloadUrlQuery,
} from "@/lib/resumesApi";
import { useState, useEffect } from "react";

// Accepted MIME types — must match the backend allowlist in resume_validator.py
const ACCEPTED_RESUME_TYPES =
  "application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,text/plain,.txt";

// 25 MB — must match settings.max_resume_upload_bytes on the backend
const MAX_RESUME_BYTES = 25 * 1024 * 1024;

export interface ResumeUploadSectionProps {
  profileId: string;
}

export default function ResumeUploadSection({ profileId: _profileId }: ResumeUploadSectionProps) {
  const { data: jobs, isLoading } = useListResumeJobsQuery();
  const [uploadResume, { isLoading: isUploading }] = useUploadResumeMutation();
  const [downloadingJobId, setDownloadingJobId] = useState<string | null>(null);

  // We trigger download imperatively via a separate query; hold the job id to trigger.
  const { data: downloadUrlData } = useGetResumeDownloadUrlQuery(downloadingJobId ?? "", {
    skip: !downloadingJobId,
  });

  // Open the presigned URL in a new tab once the query resolves, then clear the
  // pending job id so the query is not re-triggered on subsequent renders.
  useEffect(() => {
    if (downloadUrlData && downloadingJobId) {
      window.open(downloadUrlData.url, "_blank", "noopener,noreferrer");
      setDownloadingJobId(null);
    }
  }, [downloadUrlData, downloadingJobId]);

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
      showError(`Upload failed: ${extractErrorMessage(err)}`);
    }
  }

  function handleDownload(jobId: string) {
    setDownloadingJobId(jobId);
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
        maxSizeBytes={MAX_RESUME_BYTES}
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
