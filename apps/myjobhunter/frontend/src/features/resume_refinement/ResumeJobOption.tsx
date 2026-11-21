import type { RadioItemProps } from "@platform/ui";
import { resumeJobFileName } from "@myjobhunter/api-client/utils/resumeJobFileName";
import { resumeJobSummary } from "@myjobhunter/api-client/utils/resumeJobSummary";
import type { ResumeUploadJob } from "@myjobhunter/api-client/types/resume-upload-job/resume-upload-job";

interface ResumeJobOptionProps {
  job: ResumeUploadJob;
  selected: boolean;
  radioProps: RadioItemProps;
}

export default function ResumeJobOption({ job, selected, radioProps }: ResumeJobOptionProps) {
  return (
    <button
      type="button"
      {...radioProps}
      className={`w-full text-left rounded-md border p-3 transition ${
        selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
      }`}
    >
      <div className="text-sm font-medium">{resumeJobFileName(job)}</div>
      <div className="text-xs text-muted-foreground mt-0.5">
        {resumeJobSummary(job)}
      </div>
    </button>
  );
}
