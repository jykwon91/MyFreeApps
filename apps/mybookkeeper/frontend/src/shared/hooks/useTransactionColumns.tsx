import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";
import { Trash2, Check, Landmark, Home, Copy } from "lucide-react";
import { compareAsc, parseISO } from "date-fns/fp";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDate } from "@/shared/utils/date";
import { formatTag } from "@/shared/utils/tag";
import { TAG_COLORS } from "@/shared/lib/constants";
import type { Transaction } from "@/shared/types/transaction/transaction";
import Button from "@/shared/components/ui/Button";
import Badge from "@/shared/components/ui/Badge";
import TransactionStatusBadge from "@/app/features/transactions/TransactionStatusBadge";
import TransactionTypeBadge from "@/app/features/transactions/TransactionTypeBadge";
import IndeterminateCheckbox from "@/shared/components/ui/IndeterminateCheckbox";

interface ColumnActions {
  onDelete: (id: string) => void;
  onApprove: (id: string) => void;
  busyId: string | null;
  duplicateIds?: Set<string>;
  canWrite?: boolean;
}

const columnHelper = createColumnHelper<Transaction>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useTransactionColumns(propertyMap: ReadonlyMap<string, string>, actions: ColumnActions): ColumnDef<Transaction, any>[] {
  const { onDelete, onApprove, busyId, duplicateIds, canWrite = true } = actions;

  return useMemo(() => [
    columnHelper.display({
      id: "select",
      enableSorting: false,
      header: ({ table }) => (
        <IndeterminateCheckbox
          checked={table.getIsAllRowsSelected()}
          indeterminate={table.getIsSomeRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()}
          onClick={(e) => e.stopPropagation()}
          aria-label="Select all transactions"
        />
      ),
      cell: ({ row }) => (
        <IndeterminateCheckbox
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${row.original.vendor ?? "transaction"}`}
        />
      ),
    }),
    columnHelper.accessor("status", {
      header: () => <span title="Approved = included in reports. Pending = not reviewed. Needs Review = I wasn't confident in the category.">Status</span>,
      cell: ({ getValue, row }) => (
        <div className="flex items-center gap-1.5">
          <TransactionStatusBadge status={getValue()} />
          {duplicateIds?.has(row.original.id) && (
            <span className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" title="Possible duplicate">
              <Copy size={10} />
            </span>
          )}
        </div>
      ),
      filterFn: (row, _columnId, filterValue: string[]) => {
        return filterValue.includes(row.getValue<string>("status"));
      },
    }),
    columnHelper.accessor("transaction_date", {
      header: "Date",
      sortingFn: (rowA, rowB) => {
        const a = rowA.original.transaction_date ? parseISO(rowA.original.transaction_date) : new Date(0);
        const b = rowB.original.transaction_date ? parseISO(rowB.original.transaction_date) : new Date(0);
        return compareAsc(b)(a);
      },
      filterFn: (row, _columnId, filterValue: [string, string]) => {
        const val = row.original.transaction_date;
        if (!val) return false;
        const dateOnly = val.slice(0, 10);
        const [from, to] = filterValue;
        if (from && dateOnly < from) return false;
        if (to && dateOnly > to) return false;
        return true;
      },
      cell: ({ getValue }) => <span className="text-muted-foreground">{formatDate(getValue())}</span>,
    }),
    columnHelper.accessor("vendor", {
      header: "Vendor",
      cell: ({ getValue, row }) => {
        const vendor = getValue() ?? "\u2014";
        const source = row.original.external_source;
        const pending = row.original.is_pending;
        return (
          <div className="flex items-center gap-1.5">
            {source === "plaid" ? (
              <span title="Bank transaction"><Landmark size={13} className="text-blue-500 shrink-0" /></span>
            ) : source === "airbnb" ? (
              <span title="Airbnb"><Home size={13} className="text-rose-500 shrink-0" /></span>
            ) : null}
            <span>{vendor}</span>
            {pending ? <Badge label="Pending" color="gray" /> : null}
          </div>
        );
      },
      filterFn: (row, _columnId, filterValue: string[]) => {
        const val = row.getValue<string | null>("vendor");
        if (filterValue.includes("__empty__") && (!val || val.trim() === "")) return true;
        return val != null && filterValue.includes(val);
      },
    }),
    columnHelper.accessor("amount", {
      header: () => <span className="block text-right">Amount</span>,
      sortingFn: (rowA, rowB) => {
        const a = parseFloat(rowA.original.amount) || 0;
        const b = parseFloat(rowB.original.amount) || 0;
        return a - b;
      },
      cell: ({ getValue, row }) => {
        const isIncome = row.original.transaction_type === "income";
        return (
          <span className={`block text-right font-medium ${isIncome ? "text-green-600" : ""}`}>
            {isIncome ? "+" : ""}{formatCurrency(getValue())}
          </span>
        );
      },
    }),
    columnHelper.accessor("transaction_type", {
      header: "Type",
      cell: ({ getValue }) => <TransactionTypeBadge type={getValue()} />,
      filterFn: (row, _columnId, filterValue: string[]) => {
        return filterValue.includes(row.getValue<string>("transaction_type"));
      },
    }),
    columnHelper.accessor("category", {
      header: "Category",
      cell: ({ getValue }) => {
        const cat = getValue();
        const color = TAG_COLORS[cat] ?? "#94a3b8";
        return (
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
            style={{ backgroundColor: color }}
          >
            {formatTag(cat)}
          </span>
        );
      },
      filterFn: (row, _columnId, filterValue: string[]) => {
        return filterValue.includes(row.getValue<string>("category"));
      },
    }),
    columnHelper.accessor("property_id", {
      header: "Property",
      sortingFn: (rowA, rowB) => {
        const a = propertyMap.get(rowA.original.property_id ?? "") ?? "";
        const b = propertyMap.get(rowB.original.property_id ?? "") ?? "";
        return a.localeCompare(b);
      },
      cell: ({ getValue }) => (
        <span className="text-muted-foreground">{getValue() ? (propertyMap.get(getValue()!) ?? "\u2014") : "\u2014"}</span>
      ),
      filterFn: (row, _columnId, filterValue: string[]) => {
        const val = row.getValue<string | null>("property_id");
        if (filterValue.includes("__empty__") && !val) return true;
        return val != null && filterValue.includes(val);
      },
    }),
    columnHelper.accessor("tax_relevant", {
      header: () => <span title="Whether this transaction is included in your Tax Report. Set automatically based on category.">Tax</span>,
      cell: ({ getValue }) => (getValue() ? "Yes" : "No"),
      filterFn: (row, _columnId, filterValue: string[]) => {
        const val = String(row.original.tax_relevant);
        return filterValue.includes(val);
      },
    }),
    columnHelper.display({
      id: "actions",
      enableSorting: false,
      header: () => null,
      cell: ({ row }) => {
        const isPending = row.original.status === "pending" || row.original.status === "needs_review";
        if (!canWrite) return null;
        return (
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {isPending && row.original.property_id && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onApprove(row.original.id)}
                disabled={busyId === row.original.id}
                title="Approve"
                className="p-1.5 text-green-600 hover:text-green-700"
              >
                <Check size={14} />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(row.original.id)}
              disabled={busyId === row.original.id}
              title="Delete"
              className="p-1.5 text-destructive hover:text-destructive"
            >
              <Trash2 size={14} />
            </Button>
          </div>
        );
      },
    }),
  ], [propertyMap, busyId, onDelete, onApprove, duplicateIds, canWrite]);
}
