import InsuranceBenchmarkForm from "./InsuranceBenchmarkForm";
import InsurancePolicyDialogShell from "./InsurancePolicyDialogShell";
import { useGetInsuranceBenchmarkQuery } from "@/shared/store/insuranceBenchmarksApi";

export interface InsuranceBenchmarkDialogProps {
  onClose: () => void;
}

/**
 * Records what comparable property insurance costs today.
 *
 * Operator-entered rather than fetched. Texas publishes county averages
 * through TDI, but only inside an interactive viz with no feed behind it, and
 * every quote depends on the roof age, claim history and deductible of the
 * specific house — so a scraped figure would carry the same confident badge as
 * a real quote while meaning considerably less.
 */
export default function InsuranceBenchmarkDialog({
  onClose,
}: InsuranceBenchmarkDialogProps) {
  const { data: benchmark, isLoading } = useGetInsuranceBenchmarkQuery();

  return (
    <InsurancePolicyDialogShell
      title="Record the market premium"
      testId="insurance-benchmark-dialog"
      onClose={onClose}
    >
      <div className="p-5 space-y-4">
        <p className="text-sm text-muted-foreground">
          A comparable quote for a comparable house. Your policies get measured
          against it per $1,000 of dwelling coverage, so note where it came from
          — a premium with no source is impossible to check later.
        </p>

        {isLoading ? (
          <div
            className="space-y-4 animate-pulse"
            aria-busy="true"
            data-testid="insurance-benchmark-dialog-loading"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="h-16 bg-muted rounded" />
              <div className="h-16 bg-muted rounded" />
            </div>
            <div className="h-16 bg-muted rounded" />
            <div className="h-16 bg-muted rounded" />
            <div className="h-16 bg-muted rounded" />
          </div>
        ) : (
          <InsuranceBenchmarkForm
            existing={benchmark}
            onSaved={onClose}
            onCancel={onClose}
          />
        )}
      </div>
    </InsurancePolicyDialogShell>
  );
}
