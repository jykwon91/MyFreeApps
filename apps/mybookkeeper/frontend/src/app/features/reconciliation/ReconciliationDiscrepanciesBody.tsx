import { formatCurrency } from "@/shared/utils/currency";
import { formatTag } from "@/shared/utils/tag";
import { RECONCILIATION_STATUS_STYLES } from "@/shared/lib/constants";
import type { ReconciliationSource } from "@/shared/types/reconciliation/reconciliation-source";
import type { ReconciliationDiscrepanciesMode } from "@/shared/types/reconciliation/reconciliation-discrepancies-mode";
import EmptyState from "@/shared/components/ui/EmptyState";
import Skeleton from "@/shared/components/ui/Skeleton";

export interface ReconciliationDiscrepanciesBodyProps {
  mode: ReconciliationDiscrepanciesMode;
  discrepancies: readonly ReconciliationSource[];
}

export default function ReconciliationDiscrepanciesBody({
  mode,
  discrepancies,
}: ReconciliationDiscrepanciesBodyProps) {
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
      return <EmptyState message="No discrepancies found. Everything matches!" />;
    case "list":
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            These sources have discrepancies between reported and matched amounts. Review and resolve them below.
          </p>
          {discrepancies.map((d) => (
            <div key={d.id} className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">{formatTag(d.source_type)}</span>
                  {d.issuer && <span className="text-muted-foreground ml-2">{d.issuer}</span>}
                </div>
                <span className={`text-sm font-medium ${RECONCILIATION_STATUS_STYLES[d.status] ?? ""} px-2 py-0.5 rounded`}>
                  {formatTag(d.status)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">1099 Amount</p>
                  <p className="font-medium">{formatCurrency(d.reported_amount)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Reservation Total</p>
                  <p className="font-medium">{formatCurrency(d.matched_amount)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Discrepancy</p>
                  <p className={`font-medium ${parseFloat(d.discrepancy) === 0 ? "text-green-600" : "text-amber-600"}`}>
                    {formatCurrency(d.discrepancy)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      );
  }
}
