import TwoFactorSetup from "@/features/security/TwoFactorSetup";

/**
 * Settings → Security page.
 *
 * Phase 1 only ships TOTP enrollment / disable; data-export and account
 * deletion will follow in later C-series PRs (mirroring MyBookkeeper's
 * Security page once those features are wired).
 */
export default function Security() {
  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Security</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Two-factor authentication keeps your account safe even if your password is compromised.
        </p>
      </div>

      <div className="bg-card border rounded-lg p-6">
        <TwoFactorSetup />
      </div>
    </div>
  );
}
