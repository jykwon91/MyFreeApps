import ParseProvenanceWarning from "@/features/profile/ParseProvenanceWarning";
import type { ResumeJobParsedFields } from "@myjobhunter/api-client/types/resume-upload-job/resume-job-parsed-fields";
import { parseProvenanceFlags } from "@myjobhunter/api-client/utils/parseProvenanceFlags";
import { resumeParsedCounts } from "@myjobhunter/api-client/utils/resumeParsedCounts";

export interface ResumeJobParsedPanelProps {
  parsed: ResumeJobParsedFields;
}

export default function ResumeJobParsedPanel({ parsed }: ResumeJobParsedPanelProps) {
  const flagged = parseProvenanceFlags(parsed);
  return (
    <div className="mt-2 pl-11 pr-10 pb-2">
      <div className="rounded-md border bg-muted/40 p-3 space-y-2 text-xs">
        {flagged.length > 0 ? <ParseProvenanceWarning flagged={flagged} /> : null}
        {parsed.headline ? (
          <p className="font-medium text-foreground">{parsed.headline}</p>
        ) : null}
        {parsed.summary ? (
          <p className="text-muted-foreground line-clamp-3">{parsed.summary}</p>
        ) : null}
        <div className="flex flex-wrap gap-3 text-muted-foreground pt-1">
          {resumeParsedCounts(parsed).map(({ count, label }) => (
            <span key={label}>
              <span className="font-semibold text-foreground">{count}</span> {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
