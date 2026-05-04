import { useState } from "react";
import { X, Download, Trash2 } from "lucide-react";
import AlertBox from "@/shared/components/ui/AlertBox";
import TwoFactorSetup from "@/app/features/security/TwoFactorSetup";
import DeleteAccountModal from "@/app/features/security/DeleteAccountModal";
import DisplayNameSetting from "@/app/features/security/DisplayNameSetting";
import { useDismissable } from "@/shared/hooks/useDismissable";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import api from "@/shared/lib/api";

export default function Security() {
  const { dismissed: infoDismissed, dismiss: dismissInfo } = useDismissable("security-info-dismissed");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    setIsExporting(true);
    try {
      const response = await api.get("/users/me/export", { responseType: "blob" });
      const blob = new Blob([response.data as BlobPart], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      link.href = url;
      link.download = `mybookkeeper-export-${timestamp}.json`;
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
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Security</h1>

      {!infoDismissed && (
        <AlertBox variant="info" className="flex items-center justify-between gap-3">
          <span>
            Two-factor authentication adds an extra layer of security to your account. We recommend enabling it since your account contains sensitive financial data.
          </span>
          <button
            onClick={dismissInfo}
            aria-label="Dismiss"
            className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-800 dark:text-blue-200 shrink-0"
          >
            <X size={14} />
          </button>
        </AlertBox>
      )}

      <div className="bg-card border rounded-lg p-6">
        <DisplayNameSetting />
      </div>

      <div className="bg-card border rounded-lg p-6">
        <TwoFactorSetup />
      </div>

      <div className="bg-card border rounded-lg p-6 space-y-6">
        <h2 className="text-base font-semibold">Data &amp; Privacy</h2>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Export your data</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Download a JSON copy of your properties, documents metadata, transactions, and integrations status.
            </p>
          </div>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md border hover:bg-muted transition-colors disabled:opacity-50 shrink-0 min-h-[44px] sm:min-h-[32px]"
          >
            <Download size={14} />
            {isExporting ? "Preparing…" : "Download my data"}
          </button>
        </div>

        <hr className="border-border" />

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-red-600 dark:text-red-400">Delete account</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Permanently delete your account and all associated data. This cannot be undone.
            </p>
          </div>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors shrink-0 min-h-[44px] sm:min-h-[32px]"
          >
            <Trash2 size={14} />
            Delete my account
          </button>
        </div>
      </div>

      <DeleteAccountModal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
      />
    </div>
  );
}
