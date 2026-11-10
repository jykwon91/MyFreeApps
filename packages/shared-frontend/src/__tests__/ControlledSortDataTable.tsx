import { useState } from "react";
import type { SortingState } from "@tanstack/react-table";
import DataTable from "../components/data/DataTable";
import type { ColumnDef } from "../types/data-table-column-def";

interface ControlledSortDataTableProps<T extends object> {
  data: T[];
  columns: ColumnDef<T>[];
  onSortingChange: (next: SortingState) => void;
}

/** A parent that owns DataTable's sort state, for the controlled-mode tests. */
export default function ControlledSortDataTable<T extends object>({
  data,
  columns,
  onSortingChange,
}: ControlledSortDataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  return (
    <DataTable
      data={data}
      columns={columns}
      sorting={sorting}
      onSortingChange={(next) => {
        onSortingChange(next);
        setSorting(next);
      }}
    />
  );
}
