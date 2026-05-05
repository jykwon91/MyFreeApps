import { useState } from "react";
import { X, Trash2 } from "lucide-react";
import { AlertBox } from "@platform/ui";

import { useDismissable } from "@/hooks/useDismissable";
import TwoFactorSetup from "@/features/security/TwoFactorSetup";
import DisplayNameSetting from "@/features/security/DisplayNameSetting";
import DataExportButton from "@/features/security/DataExportButton";
import DeleteAccountModal from "@/features/security/DeleteAccountModal";

/**
 * Settings → Security page.
 *
 * Sections (top → bottom):
 *  - Intro AlertBox about 2FA (dismissable, persisted in localStorage)
 *  - Display Name setting — shown in profile and on exported data
 *  - Two-Factor Authentication — TOTP enrollment / disable
 *  - Data & Privacy — export your data, delete your account
 */
export default function Security() {
  const { dismissed: infoDismissed, dismiss: dismissInfo } = useDismissable(
    "mjh-security-info-dismissed",
  );
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Security</h1>

      {!infoDismissed && (
        <AlertBox variant="info" className="flex items-center justify-between gap-3">
          <span>
            Two-factor authentication adds an extra layer of security to your account. We
            recommend enabling it to protect your job applications and personal data.
          </span>
          <button
            type="button"
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
              Download a JSON copy of your profile, applications, companies,
              documents, and connected job-board metadata.
            </p>
          </div>
          <div className="shrink-0">
            <DataExportButton />
          </div>
        </div>

        <hr className="border-border" />

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-red-600 dark:text-red-400">
              Delete account
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Permanently delete your account and all associated data. This
              cannot be undone.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors shrink-0 min-h-[44px] sm:min-h-[36px]"
            aria-label="Delete my account"
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
