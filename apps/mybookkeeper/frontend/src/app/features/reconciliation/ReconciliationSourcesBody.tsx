import { RECONCILIATION_COMPARE_MESSAGES as COMPARE } from "@mybookkeeper/api-client/constants/reconciliationCompare";
import type { ReconciliationSource } from "@mybookkeeper/api-client/types/reconciliation/reconciliation-source";
import type { ReconciliationSourcesMode } from "@/shared/types/reconciliation/reconciliation-sources-mode";
import { LoadingButton } from "@platform/ui";
import EmptyState from "@/shared/components/ui/EmptyState";
import Skeleton from "@/shared/components/ui/Skeleton";
import ReconciliationSourceRow from "./ReconciliationSourceRow";

export interface ReconciliationSourcesBodyProps {
  mode: ReconciliationSourcesMode;
  sources: readonly ReconciliationSource[];
  onUploadStep: () => void;
  onNext: () => void;
  canWrite: boolean;
  isComparing: boolean;
  onCompare: () => void;
}

export default function ReconciliationSourcesBody({
  mode,
  sources,
  onUploadStep,
  onNext,
  canWrite,
  isComparing,
  onCompare,
}: ReconciliationSourcesBodyProps) {
  switch (mode) {
    case "loading":
      return (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      );
    case "empty":
      return (
        <EmptyState
          message="No reconciliation sources yet"
          action={{ label: "Upload a 1099", onClick: onUploadStep }}
        />
      );
    case "list":
      return (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground mb-4">
            Here are the 1099 sources I found.
            {canWrite && " Choose Compare with my records and I'll check each form against your income from that issuer."}
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            Each row is one 1099 form or year-end statement. A single form may cover multiple properties.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-left px-4 py-3 font-medium">Issuer</th>
                  <th className="text-left px-4 py-3 font-medium">Source Document</th>
                  <th className="text-left px-4 py-3 font-medium">Property</th>
                  <th className="text-right px-4 py-3 font-medium">1099 Amount</th>
                  <th className="text-right px-4 py-3 font-medium">Reservation Total</th>
                  <th className="text-right px-4 py-3 font-medium">Discrepancy</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  {canWrite && <th className="px-2 py-3"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {sources.map((source) => (
                  <ReconciliationSourceRow key={source.id} source={source} canWrite={canWrite} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            {canWrite && (
              <LoadingButton size="sm" isLoading={isComparing} loadingText={COMPARE.comparing} onClick={onCompare}>
                {COMPARE.compare}
              </LoadingButton>
            )}
            <LoadingButton size="sm" variant="secondary" onClick={onNext}>
              Review Discrepancies
            </LoadingButton>
          </div>
        </div>
      );
  }
}
