import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  APPLICANT_STAGE_BADGE_COLORS,
  APPLICANT_STAGE_LABELS,
} from "@/shared/lib/applicant-labels";
import { getAllowedTransitions } from "@/shared/lib/applicant-stage-transitions";
import type { ApplicantStage } from "@/shared/types/applicant/applicant-stage";
import type { BadgeColor } from "@/shared/components/ui/Badge";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import Button from "@/shared/components/ui/Button";
import { useToast } from "@/shared/hooks/useToast";
import { useTransitionApplicantStageMutation } from "@/shared/store/applicantsApi";
import { useCanWrite } from "@/shared/hooks/useOrgRole";

const NOTE_MAX_LENGTH = 500;

const COLOR_CLASSES: Record<BadgeColor, string> = {
  gray: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  green: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  red: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
};

interface Props {
  applicantId: string;
  currentStage: ApplicantStage;
}

/**
 * Renders the current stage as a clickable badge that opens a popover for
 * manual stage transitions (approve / decline / reset).
 *
 * Read-only members see a plain non-interactive badge instead.
 */
export default function ApplicantStatusControl({ applicantId, currentStage }: Props) {
  const canWrite = useCanWrite();
  const { showSuccess, showError } = useToast();
  const [transitionStage] = useTransitionApplicantStageMutation();

  const [open, setOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState<ApplicantStage | "">("");
  const [note, setNote] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const allowedNextStages = getAllowedTransitions(currentStage);
  const color = APPLICANT_STAGE_BADGE_COLORS[currentStage];
  const badgeClass = `inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium ${COLOR_CLASSES[color]}`;

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleEsc(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  function handleOpen() {
    setSelectedStage("");
    setNote("");
    setOpen(true);
  }

  async function handleConfirm() {
    if (!selectedStage) return;
    try {
      await transitionStage({
        applicantId,
        data: { new_stage: selectedStage, note: note.trim() || null },
      }).unwrap();
      const label = APPLICANT_STAGE_LABELS[selectedStage];
      showSuccess(`Applicant marked as ${label}`);
      setOpen(false);
    } catch (err: unknown) {
      const detail =
        err && typeof err === "object" && "data" in err
          ? (err as { data?: { detail?: string } }).data?.detail
          : undefined;
      showError(detail ?? "Failed to update applicant stage. Please try again.");
    }
  }

  if (!canWrite) {
    return (
      <span
        data-testid={`applicant-stage-badge-${currentStage}`}
        className={badgeClass}
      >
        {APPLICANT_STAGE_LABELS[currentStage]}
      </span>
    );
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={handleOpen}
        data-testid="applicant-status-control-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Current stage: ${APPLICANT_STAGE_LABELS[currentStage]}. Click to change.`}
        className={`${badgeClass} cursor-pointer hover:opacity-80 transition-opacity min-h-[44px]`}
      >
        <span data-testid={`applicant-stage-badge-${currentStage}`}>
          {APPLICANT_STAGE_LABELS[currentStage]}
        </span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Change applicant stage"
          data-testid="applicant-status-popover"
          className="absolute top-full left-0 mt-1 z-30 bg-card border rounded-md shadow-lg p-4 min-w-[260px] space-y-3"
        >
          <p className="text-xs font-medium text-muted-foreground">
            Move to stage
          </p>

          {allowedNextStages.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No further transitions available for this stage.
            </p>
          ) : (
            <select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value as ApplicantStage)}
              data-testid="applicant-status-stage-select"
              className="w-full rounded border bg-background px-2 py-2 text-sm min-h-[44px]"
              aria-label="Select new stage"
            >
              <option value="">— select stage —</option>
              {allowedNextStages.map((stage) => (
                <option key={stage} value={stage}>
                  {APPLICANT_STAGE_LABELS[stage]}
                </option>
              ))}
            </select>
          )}

          <div className="space-y-1">
            <label
              htmlFor="stage-transition-note"
              className="text-xs text-muted-foreground"
            >
              Note (optional)
            </label>
            <textarea
              id="stage-transition-note"
              data-testid="applicant-status-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={NOTE_MAX_LENGTH}
              rows={3}
              placeholder="e.g. References checked separately"
              className="w-full rounded border bg-background px-2 py-1.5 text-sm resize-none"
            />
            <p className="text-right text-xs text-muted-foreground">
              {note.length}/{NOTE_MAX_LENGTH}
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="applicant-status-cancel"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <LoadingButton
              type="button"
              variant="primary"
              size="sm"
              data-testid="applicant-status-confirm"
              disabled={!selectedStage}
              onClick={handleConfirm}
            >
              Confirm
            </LoadingButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
