import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button, ConfirmDialog, showError, showSuccess } from "@platform/ui";
import {
  RECONCILIATION_DELETE_MESSAGES as DELETE,
  reconciliationDeleteLabel,
} from "@mybookkeeper/api-client/constants/reconciliationDelete";
import { useDeleteReconciliationSourceMutation } from "@mybookkeeper/api-client/store/reconciliationApi";
import type { ReconciliationSource } from "@mybookkeeper/api-client/types/reconciliation/reconciliation-source";
import { RECONCILIATION_STATUS_STYLES } from "@/shared/lib/constants";
import { formatCurrency } from "@/shared/utils/currency";
import { formatTag } from "@/shared/utils/tag";
import { comparedAmounts } from "./comparedAmounts";

export interface ReconciliationSourceRowProps {
  source: ReconciliationSource;
  canWrite: boolean;
}

export default function ReconciliationSourceRow({ source, canWrite }: ReconciliationSourceRowProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleteSource, { isLoading: isDeleting }] = useDeleteReconciliationSourceMutation();
  const amounts = comparedAmounts(source);

  async function handleDelete() {
    try {
      await deleteSource(source.id).unwrap();
      showSuccess(DELETE.deleted);
    } catch {
      showError(DELETE.failed);
    } finally {
      setConfirming(false);
    }
  }

  return (
    <tr className="hover:bg-muted/40">
      <td className="px-4 py-3">{formatTag(source.source_type)}</td>
      <td className="px-4 py-3">
        {source.issuer ?? (source.source_type === "year_end_statement" ? source.document_file_name ?? "—" : "—")}
      </td>
      <td className="px-4 py-3 text-muted-foreground">{source.document_file_name ?? "—"}</td>
      <td className="px-4 py-3">{source.property_name ?? "—"}</td>
      <td className="px-4 py-3 text-right font-medium">{formatCurrency(source.reported_amount)}</td>
      <td className="px-4 py-3 text-right">{amounts.recordsTotal}</td>
      <td className={`px-4 py-3 text-right font-medium ${amounts.discrepancyClass}`}>{amounts.discrepancy}</td>
      <td className="px-4 py-3">
        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${RECONCILIATION_STATUS_STYLES[source.status] ?? ""}`}>
          {formatTag(source.status)}
        </span>
      </td>
      {canWrite && (
        <td className="px-2 py-1 text-right">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirming(true)}
            title={DELETE.action}
            aria-label={reconciliationDeleteLabel(source.issuer)}
            className="min-h-11 min-w-11 text-destructive hover:text-destructive"
          >
            <Trash2 size={16} />
          </Button>
          <ConfirmDialog
            open={confirming}
            title={DELETE.confirmTitle}
            description={DELETE.confirmBody}
            confirmLabel={DELETE.action}
            variant="danger"
            isLoading={isDeleting}
            onConfirm={() => void handleDelete()}
            onCancel={() => setConfirming(false)}
          />
        </td>
      )}
    </tr>
  );
}
