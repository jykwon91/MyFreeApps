import { AlertTriangle } from "lucide-react";
import type { ParseProvenanceEntry } from "@myjobhunter/api-client/types/resume-upload-job/parse-provenance-entry";
import { parseProvenanceHeadline } from "@myjobhunter/api-client/utils/parseProvenanceHeadline";
import { parseProvenancePlace } from "@myjobhunter/api-client/utils/parseProvenancePlace";

export interface ParseProvenanceWarningProps {
  /** The flagged lines; the caller shows this only when there's at least one. */
  flagged: ParseProvenanceEntry[];
}

// Amber advisory for parse-time hallucination-guard flags: figures,
// dates, or names the extraction produced that were NOT found in the
// uploaded resume text. Advisory only — the parsed data is kept as-is;
// the user reviews and corrects via Profile before refining.
export default function ParseProvenanceWarning({ flagged }: ParseProvenanceWarningProps) {
  return (
    <div className="rounded-md border border-amber-300/50 bg-amber-50 dark:bg-amber-950/20 p-2.5 space-y-1.5">
      <p className="flex items-start gap-1.5 font-medium text-foreground">
        <AlertTriangle size={13} className="text-amber-600 shrink-0 mt-0.5" />
        <span>{parseProvenanceHeadline(flagged.length)}</span>
      </p>
      <ul className="space-y-1 pl-5 list-disc text-muted-foreground">
        {flagged.map((entry, idx) => (
          <li key={idx}>
            <span className="font-medium text-foreground">
              {entry.unsourced_terms.join(", ")}
            </span>{" "}
            in {parseProvenancePlace(entry)}
            {": "}
            <span className="italic">“{entry.text}”</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
