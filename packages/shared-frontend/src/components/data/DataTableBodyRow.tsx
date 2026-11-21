import { flexRender, type RowData } from "@tanstack/react-table";
import { cn } from "../../utils/cn";
import { isOwnClick } from "../../utils/isOwnClick";
import RowPrimaryAction from "./RowPrimaryAction";
import type { DataTableBodyRowProps } from "../../types/data-table-body-row-props";

/**
 * One body row. A row that opens stays a table row: its primary cell holds the
 * link or button, and a click on the rest of the row (outside its controls)
 * opens it too.
 */
export default function DataTableBodyRow<T extends RowData>({
  row,
  striped,
  actionColumnId,
  onOpen,
  href,
  actionLabel,
}: DataTableBodyRowProps<T>) {
  return (
    <tr
      className={cn(
        "border-b transition-colors",
        striped && "bg-muted/30",
        onOpen && "cursor-pointer hover:bg-muted/60 focus-within:bg-muted/60",
      )}
      onClick={
        onOpen
          ? (e) => {
              if (isOwnClick(e.target, e.currentTarget)) onOpen();
            }
          : undefined
      }
    >
      {row.getAllCells().map((cell) => {
        const content = flexRender(cell.column.columnDef.cell, cell.getContext());
        const isAction = onOpen !== undefined && cell.column.id === actionColumnId;
        return (
          <td key={cell.id} className="px-3 py-2.5">
            {!isAction ? (
              content
            ) : href !== undefined ? (
              <RowPrimaryAction to={href} aria-label={actionLabel} className="block w-full">
                {content}
              </RowPrimaryAction>
            ) : (
              <RowPrimaryAction onActivate={onOpen} aria-label={actionLabel} className="block w-full">
                {content}
              </RowPrimaryAction>
            )}
          </td>
        );
      })}
    </tr>
  );
}
