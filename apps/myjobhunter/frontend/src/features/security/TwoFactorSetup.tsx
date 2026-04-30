import { useState } from "react";
import { Shield, ShieldCheck, ShieldOff, Copy, Check } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  LoadingButton,
  extractErrorMessage,
  showSuccess,
} from "@platform/ui";
import type { Step } from "@/types/security/totp-step";
import type { TotpSetup } from "@/types/security/totp-setup";
import {
  useGetTotpStatusQuery,
  useSetupTotpMutation,
  useVerifyTotpMutation,
  useDisableTotpMutation,
} from "@/store/totpApi";

/**
 * Two-factor authentication enrollment + disable flow.
 *
 * Three-step enrollment:
 *   1. status   — show "Enable 2FA" CTA
 *   2. verify   — show QR code + manual secret + 6-digit code input
 *   3. recovery — show 8 recovery codes + "I've saved them" gate
 *
 * Disable: separate "disable" step requiring a current TOTP code.
 *
 * Mirrors MyBookkeeper's `TwoFactorSetup.tsx` structure 1:1 so the two apps
 * have identical 2FA UX.
 */
export default function TwoFactorSetup() {
  const [step, setStep] = useState<Step>("status");
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const { data: statusData, isLoading: isStatusLoading } = useGetTotpStatusQuery();
  const [setupTotp, { isLoading: isSettingUp }] = useSetupTotpMutation();
  const [verifyTotp, { isLoading: isVerifying }] = useVerifyTotpMutation();
  const [disableTotp, { isLoading: isDisabling }] = useDisableTotpMutation();

  const enabled = statusData?.enabled ?? null;

  function handleStartSetup(): void {
    setError("");
    setupTotp()
      .unwrap()
      .then((data) => {
        setSetup(data);
        setRecoveryCodes(data.recovery_codes);
        setStep("verify");
      })
      .catch((err: unknown) => setError(extractErrorMessage(err)));
  }

  function handleVerify(): void {
    setError("");
    verifyTotp({ code })
      .unwrap()
      .then((data) => {
        if (data.verified) {
          setStep("recovery");
          showSuccess("2FA enabled successfully");
        }
      })
      .catch((err: unknown) => setError(extractErrorMessage(err)));
  }

  function handleDisable(): void {
    setError("");
    disableTotp({ code })
      .unwrap()
      .then(() => {
        setStep("status");
        setCode("");
        showSuccess("2FA has been disabled");
      })
      .catch((err: unknown) => setError(extractErrorMessage(err)));
  }

  function handleCopyRecovery(): void {
    navigator.clipboard.writeText(recoveryCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (isStatusLoading || enabled === null) {
    return (
      <div className="p-6">
        <div className="h-8 w-48 bg-muted/40 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        {enabled ? (
          <ShieldCheck className="h-6 w-6 text-green-500" />
        ) : (
          <Shield className="h-6 w-6 text-muted-foreground" />
        )}
        <div>
          <h3 className="font-medium">Two-Factor Authentication</h3>
          <p className="text-sm text-muted-foreground">
            {enabled
              ? "Your account is protected with 2FA."
              : "Add an extra layer of security to your account."}
          </p>
        </div>
      </div>

      {step === "status" && !enabled ? (
        <div className="space-y-2">
          <LoadingButton
            onClick={handleStartSetup}
            isLoading={isSettingUp}
            loadingText="Setting up..."
          >
            Enable 2FA
          </LoadingButton>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </div>
      ) : null}

      {step === "status" && enabled ? (
        <button
          type="button"
          onClick={() => {
            setStep("disable");
            setCode("");
            setError("");
          }}
          className="flex items-center gap-2 px-4 py-2 text-sm text-destructive border border-destructive/30 rounded-md hover:bg-destructive/10 transition-colors min-h-[44px]"
        >
          <ShieldOff className="h-4 w-4" />
          Disable 2FA
        </button>
      ) : null}

      {step === "verify" && setup ? (
        <div className="space-y-4">
          <div className="bg-muted/30 border rounded-lg p-4">
            <p className="text-sm mb-3">
              Scan this QR code with your authenticator app, or enter the secret manually:
            </p>
            <div className="flex justify-center mb-3">
              <QRCodeSVG
                value={setup.provisioning_uri}
                size={200}
                className="rounded-lg"
              />
            </div>
            <p className="text-xs text-muted-foreground text-center font-mono break-all">
              {setup.secret}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="totp-verify-code">
              Enter the 6-digit code from your app
            </label>
            <input
              id="totp-verify-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full border rounded-md px-3 py-2 text-sm font-mono text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
              placeholder="000000"
              maxLength={6}
              autoFocus
            />
          </div>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <div className="flex gap-2">
            <LoadingButton
              onClick={handleVerify}
              isLoading={isVerifying}
              loadingText="Verifying..."
              disabled={code.length !== 6}
            >
              Verify & Enable
            </LoadingButton>
            <button
              type="button"
              onClick={() => {
                setStep("status");
                setError("");
              }}
              className="px-4 py-2 text-sm border rounded-md hover:bg-muted transition-colors min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {step === "recovery" ? (
        <div className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">
              Save your recovery codes
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mb-3">
              If you lose access to your authenticator app, you can use these codes to sign in. Each code can only be used once.
            </p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {recoveryCodes.map((c) => (
                <code
                  key={c}
                  className="bg-white dark:bg-zinc-900 border px-2 py-1 rounded text-xs font-mono text-center"
                >
                  {c}
                </code>
              ))}
            </div>
            <button
              type="button"
              onClick={handleCopyRecovery}
              className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300 hover:underline"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied!" : "Copy all codes"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setStep("status")}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors min-h-[44px]"
          >
            I've saved my codes
          </button>
        </div>
      ) : null}

      {step === "disable" ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Enter a code from your authenticator app to disable 2FA.
          </p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="w-full border rounded-md px-3 py-2 text-sm font-mono text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
            placeholder="000000"
            maxLength={6}
            autoFocus
          />
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <div className="flex gap-2">
            <LoadingButton
              onClick={handleDisable}
              isLoading={isDisabling}
              loadingText="Disabling..."
              disabled={code.length !== 6}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Disable 2FA
            </LoadingButton>
            <button
              type="button"
              onClick={() => {
                setStep("status");
                setError("");
              }}
              className="px-4 py-2 text-sm border rounded-md hover:bg-muted transition-colors min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
