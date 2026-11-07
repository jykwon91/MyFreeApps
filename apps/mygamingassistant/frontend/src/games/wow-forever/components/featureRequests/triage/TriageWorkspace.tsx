import { useEffect, useId, useState } from "react";
import { AlertBox } from "@platform/ui";
import TriageAllRequests from "@/games/wow-forever/components/featureRequests/triage/TriageAllRequests";
import TriageHeader from "@/games/wow-forever/components/featureRequests/triage/TriageHeader";
import TriageInbox from "@/games/wow-forever/components/featureRequests/triage/TriageInbox";
import TriageSheets from "@/games/wow-forever/components/featureRequests/triage/TriageSheets";
import { useGetTriageInboxQuery } from "@/games/wow-forever/api/triageApi";
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import { TRIAGE_SECONDARY_BUTTON } from "@/games/wow-forever/data/featureRequests/triage/triageStyles";
import { useCountdown } from "@/games/wow-forever/hooks/featureRequests/triage/useCountdown";
import { useTriageActions } from "@/games/wow-forever/hooks/featureRequests/triage/useTriageActions";
import { useTriageParams } from "@/games/wow-forever/hooks/featureRequests/triage/useTriageParams";
import { isNotOperator } from "@/games/wow-forever/lib/featureRequests/triage/triageErrors";
import { unsavedLabel } from "@/games/wow-forever/lib/featureRequests/triage/triageFormat";
import { signOutAfterSaving } from "@/lib/auth";
import { registerPendingWrites } from "@/lib/pendingWrites";

/** The signed-in screen: header, the active tab, the 429 / unsaved banners and the open sheet. */
export default function TriageWorkspace() {
  const panelId = useId();
  const params = useTriageParams();
  const actions = useTriageActions();
  const inbox = useGetTriageInboxQuery();
  const [signingOut, setSigningOut] = useState(false);
  const slowDownSeconds = useCountdown(actions.rateLimitedUntil);
  const notOperator = isNotOperator(inbox.error);

  // Any Sign out (this header's or the shell's) sends what's still in its undo window first.
  useEffect(() => registerPendingWrites(actions.flushAll), [actions.flushAll]);

  function signOut() {
    setSigningOut(true);
    void signOutAfterSaving();
  }

  return (
    <div className="min-h-screen" data-testid="triage-workspace">
      <TriageHeader
        tab={params.tab}
        onTab={params.setTab}
        inboxCount={inbox.data?.total_untriaged ?? null}
        onSignOut={signOut}
        signingOut={signingOut}
        panelId={panelId}
      />
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        {slowDownSeconds > 0 ? (
          <AlertBox variant="warning">
            <span role="status">
              {TRIAGE_COPY.slowDown} — {slowDownSeconds}s
            </span>
          </AlertBox>
        ) : null}
        {actions.unsaved.length > 0 ? (
          <AlertBox variant="error">
            <div className="flex flex-wrap items-center gap-3">
              <span role="alert">{unsavedLabel(actions.unsaved.length)}</span>
              <button type="button" onClick={actions.retryUnsaved} className={TRIAGE_SECONDARY_BUTTON}>
                {TRIAGE_COPY.retry}
              </button>
            </div>
          </AlertBox>
        ) : null}
        {notOperator ? (
          <AlertBox variant="error">
            <span role="alert" data-testid="triage-not-operator">
              {TRIAGE_COPY.notOperator}
            </span>
          </AlertBox>
        ) : null}
        <section hidden={notOperator} role="tabpanel" id={panelId} aria-labelledby={`${panelId}-tab-${params.tab}`}>
          {params.tab === "inbox" ? (
            <TriageInbox actions={actions} onOpenSheet={params.openSheet} />
          ) : (
            <TriageAllRequests
              actions={actions}
              filters={params.filters}
              onFiltersChange={params.setFilters}
              onOpenSheet={params.openSheet}
            />
          )}
        </section>
      </div>
      <TriageSheets sheet={params.sheet} tab={params.tab} actions={actions} onClose={params.closeSheet} />
    </div>
  );
}
