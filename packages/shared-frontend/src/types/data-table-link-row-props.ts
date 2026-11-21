import type { RowData } from "@tanstack/react-table";
import type { DataTableBodyRowProps } from "./data-table-body-row-props";

export type DataTableLinkRowProps<T extends RowData> = Omit<DataTableBodyRowProps<T>, "onOpen" | "href"> & {
  href: string;
};
