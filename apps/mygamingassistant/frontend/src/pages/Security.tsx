import { X } from "lucide-react";
import { AlertBox } from "@platform/ui";

import { useDismissable } from "@/hooks/useDismissable";
import TwoFactorSetup from "@platform/ui/components/auth/TwoFactorSetup";
import DisplayNameSetting from "@/features/security/DisplayNameSetting";
import DataPrivacySection from "@/features/security/DataPrivacySection";
import { isServeOnly } from "@/lib/serveOnly";

// Serve-only mounts only the 2FA routes for the operator — no display-name PATCH, export or delete.
const accountSections = !isServeOnly();

/**
 * Security page.
 *
 * Sections (top → bottom):
 *  - Intro AlertBox about 2FA (dismissable, persisted in localStorage)
 *  - Display Name setting (not on serve-only)
 *  - Two-Factor Authentication — TOTP enrollment / disable
 *  - Data & Privacy — export your data, delete your account (not on serve-only)
 */
export default function Security() {
  const { dismissed: infoDismissed, dismiss: dismissInfo } = useDismissable(
    "mga-security-info-dismissed",
  );

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">Security</h1>

      {!infoDismissed && (
        <AlertBox variant="info" className="flex items-center justify-between gap-3">
          <span>
            Two-factor authentication adds an extra layer of security to your account. We
            recommend enabling it to protect your lineup data and account access.
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

      {accountSections && (
        <div className="bg-card border rounded-lg p-6">
          <DisplayNameSetting />
        </div>
      )}

      <div className="bg-card border rounded-lg p-6">
        <TwoFactorSetup />
      </div>

      {accountSections && <DataPrivacySection />}
    </div>
  );
}
