import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LoadingRegion, Skeleton } from "@platform/ui";
import PlaidAccountMatchDialog from "@/app/features/financial-accounts/plaid/PlaidAccountMatchDialog";
import { usePlaidLinkFlow } from "@/app/features/financial-accounts/plaid/usePlaidLinkFlow";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import { PLAID_MESSAGES as MSG } from "@/shared/lib/plaid-messages";
import { readPlaidLinkSession } from "@/shared/lib/plaidLinkSessionStorage";

const ACCOUNTS_PATH = "/financial-accounts";

/**
 * Where an OAuth bank (Chase) sends the person back mid-Link. Resumes the
 * Link session started on Financial Accounts with the address the bank
 * returned, then goes back there. FRONTEND_URL + this path is registered
 * in the Plaid dashboard.
 */
export default function PlaidOAuthReturn() {
  const navigate = useNavigate();
  const [session] = useState(readPlaidLinkSession);
  const [receivedRedirectUri] = useState(() => window.location.href);
  const backToAccounts = useCallback(() => navigate(ACCOUNTS_PATH, { replace: true }), [navigate]);
  const plaid = usePlaidLinkFlow({ receivedRedirectUri, resume: session, onSettled: backToAccounts });

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <SectionHeader title={MSG.oauthTitle} />
      {session ? (
        <LoadingRegion label={MSG.oauthResuming} className="space-y-2" data-testid="plaid-oauth-resuming">
          <p className="text-sm text-muted-foreground">{MSG.oauthResuming}</p>
          <Skeleton className="h-4 w-1/2" />
        </LoadingRegion>
      ) : (
        <div className="space-y-3" data-testid="plaid-oauth-no-session">
          <p className="text-sm">{MSG.oauthNoSession}</p>
          <Link to={ACCOUNTS_PATH} className="text-sm underline min-h-[44px] inline-flex items-center">{MSG.backToAccounts}</Link>
        </div>
      )}
      {plaid.pending ? (
        <PlaidAccountMatchDialog
          connection={plaid.pending}
          onClose={() => {
            plaid.clearPending();
            backToAccounts();
          }}
        />
      ) : null}
    </div>
  );
}
