import { format, parseISO } from "date-fns";
import { FileText, Eye } from "lucide-react";
import type { DuplicateTransaction } from "@/shared/types/transaction/duplicate";
import Badge from "@/shared/components/ui/Badge";
import { formatTag } from "@/shared/utils/tag";

export interface TransactionSideProps {
  txn: DuplicateTransaction;
  propertyMap: Map<string, string>;
  label: string;
  onViewSource?: (docId: string) => void;
}

export default function TransactionSide({ txn, propertyMap, label, onViewSource }: TransactionSideProps) {
  const propertyName = txn.property_id ? propertyMap.get(txn.property_id) ?? "Unknown" : "No property";
  const sourceCount = (txn.linked_document_ids?.length ?? 0) + (txn.source_document_id ? 1 : 0);

  return (
    <div className="flex-1 min-w-0 p-4 bg-muted/30 rounded-lg space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase">{label}</span>
        <div className="flex items-center gap-2">
          <Badge label={txn.status} color={txn.status === "approved" ? "green" : txn.status === "pending" ? "yellow" : "orange"} />
          {txn.is_manual ? <Badge label="Manual" color="blue" /> : null}
          {sourceCount > 1 ? <Badge label={`${sourceCount} sources`} color="blue" /> : null}
        </div>
      </div>

      <div className="text-lg font-semibold">${Number(txn.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>

      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Date</span>
          <span>{format(parseISO(txn.transaction_date), "MMM d, yyyy")}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Vendor</span>
          <span className="truncate ml-2 text-right">{txn.vendor ?? "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Category</span>
          <span>{formatTag(txn.category)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Type</span>
          <span className="capitalize">{txn.transaction_type}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Property</span>
          <span className="truncate ml-2 text-right">{propertyName}</span>
        </div>
        {txn.source_file_name ? (
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Source</span>
            {txn.source_document_id && onViewSource ? (
              <button
                type="button"
                onClick={() => onViewSource(txn.source_document_id!)}
                className="flex items-center gap-1 text-xs truncate ml-2 text-blue-600 dark:text-blue-400 hover:underline"
                title="View source document"
              >
                <Eye size={12} />
                {txn.source_file_name}
              </button>
            ) : (
              <span className="flex items-center gap-1 text-xs truncate ml-2">
                <FileText size={12} />
                {txn.source_file_name}
              </span>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
