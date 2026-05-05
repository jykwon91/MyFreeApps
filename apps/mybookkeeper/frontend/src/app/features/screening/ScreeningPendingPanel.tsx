import { Loader2, Upload } from "lucide-react";
import Button from "@/shared/components/ui/Button";
import { formatRelativeTime } from "@/shared/lib/inquiry-date-format";
import type { ScreeningResult } from "@/shared/types/applicant/screening-result";

export interface ScreeningPendingPanelProps {
  pendingResult: ScreeningResult;
  onUploadClick: () => void;
  canWrite: boolean;
}

/**
 * Status panel shown when the most-recent screening result is "pending" —
 * i.e., the host has opened the provider dashboard but hasn't uploaded a
 * report yet.
 *
 * Uses AI-conversational tone per CLAUDE.md § UX: AI Interactions.
 */
export default function ScreeningPendingPanel({ pendingResult, onUploadClick, canWrite }: ScreeningPendingPanelProps) {
  return (
    <div
      data-testid="screening-pending-panel"
      className="flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950"
    >
      <div className="flex items-start gap-3">
        <Loader2
          className="h-5 w-5 flex-shrink-0 animate-spin text-blue-600 dark:text-blue-400 mt-0.5"
          aria-hidden="true"
        />
        <div className="text-sm">
          <p className="font-medium text-blue-800 dark:text-blue-200">
            Running background check — waiting for results
          </p>
          <p className="mt-1 text-blue-700 dark:text-blue-300 text-xs">
            Started {formatRelativeTime(pendingResult.requested_at)} via{" "}
            <span className="font-medium capitalize">{pendingResult.provider}</span>.
            This usually takes a day or two depending on the provider.
          </p>
        </div>
      </div>

      {canWrite ? (
        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-xs text-blue-700 dark:text-blue-300">
            Got the report? Upload it here to record the outcome.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onUploadClick}
            data-testid="screening-pending-upload-button"
          >
            <span className="flex items-center gap-1.5">
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              Upload report
            </span>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
