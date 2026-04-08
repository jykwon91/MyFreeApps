import { useState, useCallback, useEffect } from "react";
import { Shield, ShieldCheck, ShieldOff, Copy, Check } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import api from "@/shared/lib/api";
import { extractErrorMessage } from "@/shared/utils/errorMessage";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { showSuccess } from "@/shared/lib/toast-store";
import type { Step } from "@/shared/types/security/totp-step";
import type { TotpSetup } from "@/shared/types/security/totp-setup";

export default function TwoFactorSetup() {
  const [step, setStep] = useState<Step>("status");
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const fetchStatus = useCallback(async () => {
    const { data } = await api.get("/auth/totp/status");
    setEnabled(data.enabled);
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function handleStartSetup() {
    setIsLoading(true);
    setError("");
    try {
      const { data } = await api.post<TotpSetup>("/auth/totp/setup");
      setSetup(data);
      setStep("verify");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerify() {
    setIsLoading(true);
    setError("");
    try {
      const { data } = await api.post<{ verified: boolean; recovery_codes: string[] }>("/auth/totp/verify", { code });
      if (data.verified) {
        setRecoveryCodes(data.recovery_codes);
        setEnabled(true);
        setStep("recovery");
        showSuccess("2FA enabled successfully");
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDisable() {
    setIsLoading(true);
    setError("");
    try {
      await api.post("/auth/totp/disable", { code });
      setEnabled(false);
      setStep("status");
      setCode("");
      showSuccess("2FA has been disabled");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }

  function handleCopyRecovery() {
    navigator.clipboard.writeText(recoveryCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (enabled === null) {
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
            {enabled ? "Your account is protected with 2FA." : "Add an extra layer of security to your account."}
          </p>
        </div>
      </div>

      {step === "status" && !enabled ? (
        <div className="space-y-2">
          <LoadingButton onClick={handleStartSetup} isLoading={isLoading} loadingText="Setting up...">
            Enable 2FA
          </LoadingButton>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </div>
      ) : null}

      {step === "status" && enabled ? (
        <button
          onClick={() => { setStep("disable"); setCode(""); setError(""); }}
          className="flex items-center gap-2 px-4 py-2 text-sm text-destructive border border-destructive/30 rounded-md hover:bg-destructive/10 transition-colors"
        >
          <ShieldOff className="h-4 w-4" />
          Disable 2FA
        </button>
      ) : null}

      {step === "verify" && setup ? (
        <div className="space-y-4">
          <div className="bg-muted/30 border rounded-lg p-4">
            <p className="text-sm mb-3">Scan this QR code with your authenticator app, or enter the secret manually:</p>
            <div className="flex justify-center mb-3">
              <QRCodeSVG
                value={setup.provisioning_uri}
                size={200}
                className="rounded-lg"
              />
            </div>
            <p className="text-xs text-muted-foreground text-center font-mono break-all">{setup.secret}</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Enter the 6-digit code from your app</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full border rounded-md px-3 py-2 text-sm font-mono text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="000000"
              maxLength={6}
              autoFocus
            />
          </div>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <div className="flex gap-2">
            <LoadingButton onClick={handleVerify} isLoading={isLoading} loadingText="Verifying..." disabled={code.length !== 6}>
              Verify & Enable
            </LoadingButton>
            <button onClick={() => { setStep("status"); setError(""); }} className="px-4 py-2 text-sm border rounded-md hover:bg-muted transition-colors">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {step === "recovery" ? (
        <div className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">Save your recovery codes</p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mb-3">
              If you lose access to your authenticator app, you can use these codes to sign in. Each code can only be used once.
            </p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {recoveryCodes.map((c) => (
                <code key={c} className="bg-white dark:bg-zinc-900 border px-2 py-1 rounded text-xs font-mono text-center">{c}</code>
              ))}
            </div>
            <button onClick={handleCopyRecovery} className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300 hover:underline">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied!" : "Copy all codes"}
            </button>
          </div>
          <button onClick={() => setStep("status")} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">
            I've saved my codes
          </button>
        </div>
      ) : null}

      {step === "disable" ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Enter a code from your authenticator app to disable 2FA.</p>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="w-full border rounded-md px-3 py-2 text-sm font-mono text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="000000"
            maxLength={6}
            autoFocus
          />
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <div className="flex gap-2">
            <LoadingButton onClick={handleDisable} isLoading={isLoading} loadingText="Disabling..." disabled={code.length !== 6} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Disable 2FA
            </LoadingButton>
            <button onClick={() => { setStep("status"); setError(""); }} className="px-4 py-2 text-sm border rounded-md hover:bg-muted transition-colors">
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
