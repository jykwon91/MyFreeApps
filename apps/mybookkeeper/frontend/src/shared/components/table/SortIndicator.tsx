import { ChevronUp, ChevronDown } from "lucide-react";
import type { Header } from "@tanstack/react-table";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function SortIndicator({ header }: { header: Header<any, unknown> }) {
  const sorted = header.column.getIsSorted();
  if (sorted === "asc") return <ChevronUp className="h-3.5 w-3.5 text-foreground shrink-0" />;
  if (sorted === "desc") return <ChevronDown className="h-3.5 w-3.5 text-foreground shrink-0" />;
  return null;
}
