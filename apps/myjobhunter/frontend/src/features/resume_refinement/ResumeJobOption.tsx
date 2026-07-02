import type { ResumeUploadJob } from "@/types/resume-upload-job/resume-upload-job";

interface ResumeJobOptionProps {
  job: ResumeUploadJob;
  selected: boolean;
  onSelect: () => void;
}

export default function ResumeJobOption({ job, selected, onSelect }: ResumeJobOptionProps) {
  const fields = job.result_parsed_fields;
  const summary = fields
    ? `${fields.work_history_count} role${fields.work_history_count === 1 ? "" : "s"}, ${fields.skills_count} skills`
    : "Parsed resume";
  const filename = job.file_filename ?? "resume";
  const uploaded = new Date(job.created_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-md border p-3 transition ${
        selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
      }`}
    >
      <div className="text-sm font-medium">{filename}</div>
      <div className="text-xs text-muted-foreground mt-0.5">
        {summary} · uploaded {uploaded}
      </div>
    </button>
  );
}
