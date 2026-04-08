import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Download, ChevronDown } from "lucide-react";
import Button from "@/shared/components/ui/Button";
import Spinner from "@/shared/components/icons/Spinner";

interface ExportDropdownProps {
  onExportCSV: () => Promise<void>;
  onExportPDF: () => Promise<void>;
}

export default function ExportDropdown({ onExportCSV, onExportPDF }: ExportDropdownProps) {
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);

  async function handleExport(type: "csv" | "pdf") {
    setExporting(type);
    try {
      if (type === "csv") await onExportCSV();
      else await onExportPDF();
    } finally {
      setExporting(null);
    }
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button size="sm" variant="secondary" disabled={exporting !== null}>
          {exporting ? <Spinner className="mr-1.5" /> : <Download size={14} className="mr-1.5" />}
          {exporting ? "Exporting..." : "Export"}
          <ChevronDown size={12} className="ml-1" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-20 min-w-[140px] bg-card border rounded-md shadow-lg py-1"
          sideOffset={4}
          align="end"
        >
          <DropdownMenu.Item
            className="w-full text-left px-4 py-2 text-sm cursor-pointer outline-none hover:bg-muted"
            onSelect={() => handleExport("csv")}
            disabled={exporting !== null}
          >
            {exporting === "csv" ? "Exporting CSV..." : "Export CSV"}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="w-full text-left px-4 py-2 text-sm cursor-pointer outline-none hover:bg-muted"
            onSelect={() => handleExport("pdf")}
            disabled={exporting !== null}
          >
            {exporting === "pdf" ? "Exporting PDF..." : "Export PDF"}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
