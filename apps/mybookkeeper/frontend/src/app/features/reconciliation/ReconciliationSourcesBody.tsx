import { formatCurrency } from "@/shared/utils/currency";
import { formatTag } from "@/shared/utils/tag";
import { RECONCILIATION_STATUS_STYLES } from "@/shared/lib/constants";
import type { ReconciliationSource } from "@/shared/types/reconciliation/reconciliation-source";
import type { ReconciliationSourcesMode } from "@/shared/types/reconciliation/reconciliation-sources-mode";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import EmptyState from "@/shared/components/ui/EmptyState";
import Skeleton from "@/shared/components/ui/Skeleton";

export interface ReconciliationSourcesBodyProps {
  mode: ReconciliationSourcesMode;
  sources: readonly ReconciliationSource[];
  onUploadStep: () => void;
  onNext: () => void;
}

export default function ReconciliationSourcesBody({
  mode,
  sources,
  onUploadStep,
  onNext,
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
            Here are the 1099 sources I found. I have automatically matched them against your reservations.
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
                </tr>
              </thead>
              <tbody className="divide-y">
                {sources.map((source) => (
                  <tr key={source.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3">{formatTag(source.source_type)}</td>
                    <td className="px-4 py-3">
                      {source.issuer ?? (source.source_type === "year_end_statement" ? source.document_file_name ?? "—" : "—")}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{source.document_file_name ?? "—"}</td>
                    <td className="px-4 py-3">{source.property_name ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(source.reported_amount)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(source.matched_amount)}</td>
                    <td className={`px-4 py-3 text-right font-medium ${parseFloat(source.discrepancy) === 0 ? "text-green-600" : "text-amber-600"}`}>
                      {formatCurrency(source.discrepancy)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${RECONCILIATION_STATUS_STYLES[source.status] ?? ""}`}>
                        {formatTag(source.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end pt-2">
            <LoadingButton size="sm" variant="secondary" onClick={onNext}>
              Review Discrepancies
            </LoadingButton>
          </div>
        </div>
      );
  }
}
