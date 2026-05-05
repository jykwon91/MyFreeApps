import type { ResumeJobParsedFields } from "@/types/resume-upload-job/resume-upload-job";

export interface ResumeJobParsedPanelProps {
  parsed: ResumeJobParsedFields;
}

export default function ResumeJobParsedPanel({ parsed }: ResumeJobParsedPanelProps) {
  return (
    <div className="mt-2 pl-11 pr-10 pb-2">
      <div className="rounded-md border bg-muted/40 p-3 space-y-2 text-xs">
        {parsed.headline ? (
          <p className="font-medium text-foreground">{parsed.headline}</p>
        ) : null}
        {parsed.summary ? (
          <p className="text-muted-foreground line-clamp-3">{parsed.summary}</p>
        ) : null}
        <div className="flex flex-wrap gap-3 text-muted-foreground pt-1">
          <span>
            <span className="font-semibold text-foreground">{parsed.work_history_count}</span>{" "}
            {parsed.work_history_count === 1 ? "role" : "roles"}
          </span>
          <span>
            <span className="font-semibold text-foreground">{parsed.education_count}</span>{" "}
            {parsed.education_count === 1 ? "education" : "education entries"}
          </span>
          <span>
            <span className="font-semibold text-foreground">{parsed.skills_count}</span>{" "}
            {parsed.skills_count === 1 ? "skill" : "skills"}
          </span>
        </div>
      </div>
    </div>
  );
}
