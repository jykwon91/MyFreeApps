import { X } from "lucide-react";
import AlertBox from "@/shared/components/ui/AlertBox";
import TwoFactorSetup from "@/app/features/security/TwoFactorSetup";
import { useDismissable } from "@/shared/hooks/useDismissable";

export default function Security() {
  const { dismissed: infoDismissed, dismiss: dismissInfo } = useDismissable("security-info-dismissed");

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
        <TwoFactorSetup />
      </div>
    </div>
  );
}
