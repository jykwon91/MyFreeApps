import { Download, Trash2 } from "lucide-react";
import Button from "@/shared/components/ui/Button";

export interface PhotoSelectionToolbarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClear: () => void;
  onBulkDelete: () => void;
  onBulkDownload: () => void;
  isBulkDeleting: boolean;
  isBulkDownloading: boolean;
}

export default function PhotoSelectionToolbar({
  selectedCount,
  totalCount,
  onSelectAll,
  onClear,
  onBulkDelete,
  onBulkDownload,
  isBulkDeleting,
  isBulkDownloading,
}: PhotoSelectionToolbarProps) {
  return (
    <div
      className="flex items-center gap-3 px-3 py-2 bg-muted/60 border rounded-lg flex-wrap"
      data-testid="photo-selection-toolbar"
    >
      <span className="text-sm font-medium shrink-0" data-testid="photo-selection-count">
        {selectedCount} selected
      </span>

      <div className="flex items-center gap-2 flex-1 flex-wrap">
        {selectedCount < totalCount ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSelectAll}
            type="button"
            data-testid="photo-select-all-button"
          >
            Select all ({totalCount})
          </Button>
        ) : null}

        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          type="button"
          data-testid="photo-clear-selection-button"
        >
          Clear
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBulkDownload}
          disabled={isBulkDownloading || isBulkDeleting}
          type="button"
          data-testid="photo-bulk-download-button"
        >
          <Download className="h-4 w-4 mr-1" />
          {isBulkDownloading ? "Downloading..." : "Download"}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onBulkDelete}
          disabled={isBulkDeleting || isBulkDownloading}
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
          type="button"
          data-testid="photo-bulk-delete-button"
        >
          <Trash2 className="h-4 w-4 mr-1" />
          {isBulkDeleting ? "Deleting..." : "Delete"}
        </Button>
      </div>
    </div>
  );
}
