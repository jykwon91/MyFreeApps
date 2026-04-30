import { useState } from "react";
import { Download } from "lucide-react";
import { LoadingButton, showError, showSuccess } from "@platform/ui";
import api from "@/lib/api";

const EXPORT_ENDPOINT = "/users/me/export";
const FILENAME_PREFIX = "myjobhunter-export";

/**
 * Single-button trigger for ``GET /users/me/export``.
 *
 * Streams the JSON response into a Blob and forces a browser download
 * named ``myjobhunter-export-<UTC timestamp>.json``. Uses
 * ``responseType: "blob"`` so axios doesn't attempt to parse a multi-MB
 * payload as JS.
 */
export default function DataExportButton() {
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    setIsExporting(true);
    try {
      const response = await api.get(EXPORT_ENDPOINT, { responseType: "blob" });
      const blob = new Blob([response.data as BlobPart], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      link.href = url;
      link.download = `${FILENAME_PREFIX}-${timestamp}.json`;
      link.click();
      URL.revokeObjectURL(url);
      showSuccess("Your data export is downloading.");
    } catch {
      showError("Failed to export your data. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <LoadingButton
      variant="secondary"
      size="sm"
      onClick={handleExport}
      isLoading={isExporting}
      loadingText="Preparing..."
      aria-label="Download my data"
    >
      <span className="flex items-center gap-2">
        <Download size={14} />
        Download my data
      </span>
    </LoadingButton>
  );
}
