import {
  IMPROVEMENT_TYPE_LABEL,
  SEVERITY_BADGE_CLASS,
  SEVERITY_LABEL,
} from "@/features/resume_refinement/improvement-target-labels";
import type {
  ImprovementSeverity,
  ImprovementType,
} from "@/types/resume-refinement/improvement-target";

interface TargetMetaBadgesProps {
  improvementType: ImprovementType;
  severity: ImprovementSeverity;
  /**
   * Free-form note from the critique pass — one sentence on WHY this
   * target was flagged. Optional: many targets don't carry a note.
   */
  notes?: string | null;
}

/**
 * Surfaces the AI's reason for flagging the active target. Two badges
 * (improvement type, severity) plus an optional one-sentence
 * rationale. Renders inline above the "Currently" block in the
 * suggestion card so the operator sees the WHY before the WHAT.
 */
export default function TargetMetaBadges({
  improvementType,
  severity,
  notes,
}: TargetMetaBadgesProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary/10 text-primary">
          {IMPROVEMENT_TYPE_LABEL[improvementType]}
        </span>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${SEVERITY_BADGE_CLASS[severity]}`}
        >
          {SEVERITY_LABEL[severity]}
        </span>
      </div>
      {notes && (
        <p className="text-xs text-muted-foreground leading-snug">{notes}</p>
      )}
    </div>
  );
}
