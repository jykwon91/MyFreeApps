import type { ResumeUploadJob } from "@myjobhunter/api-client/types/resume-upload-job/resume-upload-job";

export interface ResumeJobRowProps {
  job: ResumeUploadJob;
  isSelected: boolean;
  onSelect: () => void;
}
