import { useCallback, useMemo, useState } from "react";
import type { ColumnFiltersState, SortingState } from "@tanstack/react-table";
import { useDebouncedValue } from "@platform/core/hooks/useDebouncedValue";
import { documentListArgs } from "@/shared/utils/document-list-args";
import type { DocumentListControls } from "@/shared/types/document/document-list-controls";

/** The search is sent once typing pauses, so the server isn't asked on every keystroke. */
export function useDocumentListControls(): DocumentListControls {
  const [searchQuery, setSearchQuery] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([{ id: "created_at", desc: true }]);
  const search = useDebouncedValue(searchQuery.trim());

  const args = useMemo(() => documentListArgs(search, columnFilters, sorting), [search, columnFilters, sorting]);

  const showFailed = useCallback(() => {
    setSearchQuery("");
    setColumnFilters([{ id: "status", value: ["failed"] }]);
  }, []);

  return { searchQuery, setSearchQuery, columnFilters, setColumnFilters, sorting, setSorting, showFailed, args };
}
