import { useState } from "react";
import { Trash2 } from "lucide-react";

import TwoFactorSetup from "@/features/security/TwoFactorSetup";
import DataExportButton from "@/features/security/DataExportButton";
import DeleteAccountModal from "@/features/security/DeleteAccountModal";

/**
 * Settings → Security page.
 *
 * Sections (top → bottom):
 *  - Two-Factor Authentication (PR C5) — TOTP enrollment / disable
 *  - Data & Privacy (PR C6) — export your data, delete your account
 */
export default function Security() {
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Security</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account security, data, and privacy.
        </p>
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
