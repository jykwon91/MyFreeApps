import { useId, useState } from "react";
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
import { useTriageActivity } from "@/games/wow-forever/hooks/featureRequests/triage/useTriageActivity";
import { useTriageParams } from "@/games/wow-forever/hooks/featureRequests/triage/useTriageParams";
import { lockTriage } from "@/games/wow-forever/lib/featureRequests/triage/triageKeyStore";
import { unsavedLabel } from "@/games/wow-forever/lib/featureRequests/triage/triageFormat";

/** The unlocked screen: header, the active tab, the 429 / unsaved banners and the open sheet. */
export default function TriageWorkspace() {
  useTriageActivity();
  const panelId = useId();
  const params = useTriageParams();
  const actions = useTriageActions();
  const inbox = useGetTriageInboxQuery();
  const [locking, setLocking] = useState(false);
  const slowDownSeconds = useCountdown(actions.rateLimitedUntil);

  async function lock() {
    setLocking(true);
    // Anything still in its undo window is sent before the key is forgotten.
    await actions.flushAll();
    lockTriage("manual");
  }

  return (
    <div className="min-h-screen" data-testid="triage-workspace">
      <TriageHeader
        tab={params.tab}
        onTab={params.setTab}
        inboxCount={inbox.data?.total_untriaged ?? null}
        onLock={() => void lock()}
        locking={locking}
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
        <section role="tabpanel" id={panelId} aria-labelledby={`${panelId}-tab-${params.tab}`}>
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
