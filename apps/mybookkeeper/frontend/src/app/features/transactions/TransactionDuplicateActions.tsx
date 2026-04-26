import { useState } from "react";
import { Copy, Check, XCircle } from "lucide-react";
import { formatDate } from "@/shared/utils/date";
import type { DuplicateTransaction } from "@/shared/types/transaction/duplicate";

interface Props {
  transactionId: string;
  dupOther: DuplicateTransaction;
  onKeepDuplicate: (keepId: string, deleteIds: string[]) => Promise<void>;
  onDismissDuplicate: (transactionIds: string[]) => Promise<void>;
}

export default function TransactionDuplicateActions({ transactionId, dupOther, onKeepDuplicate, onDismissDuplicate }: Props) {
  const [dupBusy, setDupBusy] = useState<"keep" | "dismiss" | null>(null);

  return (
    <div className="rounded-md border border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/20 px-3 py-2 text-sm text-orange-800 dark:text-orange-300">
      <div className="flex items-center gap-2 mb-2">
        <Copy size={14} className="shrink-0" />
        <span className="font-medium">Possible duplicate</span>
      </div>
      <p className="text-xs mb-3">
        {dupOther.vendor ?? "Unknown vendor"} &mdash; ${dupOther.amount} on{" "}
        {formatDate(dupOther.transaction_date)}
        {dupOther.source_file_name && ` (${dupOther.source_file_name})`}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={dupBusy !== null}
          onClick={async () => {
            setDupBusy("keep");
            try {
              await onKeepDuplicate(transactionId, [dupOther.id]);
            } finally {
              setDupBusy(null);
            }
          }}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Check size={12} />
          {dupBusy === "keep" ? "Keeping..." : "Keep this one"}
        </button>
        <button
          type="button"
          disabled={dupBusy !== null}
          onClick={async () => {
            setDupBusy("dismiss");
            try {
              await onDismissDuplicate([transactionId, dupOther.id]);
            } finally {
              setDupBusy(null);
            }
          }}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded border border-border hover:bg-muted disabled:opacity-50"
        >
          <XCircle size={12} />
          {dupBusy === "dismiss" ? "Dismissing..." : "Not duplicates"}
        </button>
      </div>
    </div>
  );
}
