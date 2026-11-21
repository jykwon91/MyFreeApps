import { useNavigate } from "react-router-dom";
import type { RowData } from "@tanstack/react-table";
import DataTableBodyRow from "./DataTableBodyRow";
import type { DataTableLinkRowProps } from "../../types/data-table-link-row-props";

/** A body row that opens a page: its primary cell is a link, and a click on the rest of the row goes there too. */
export default function DataTableLinkRow<T extends RowData>({ href, ...rest }: DataTableLinkRowProps<T>) {
  const navigate = useNavigate();
  return <DataTableBodyRow {...rest} href={href} onOpen={() => navigate(href)} />;
}
