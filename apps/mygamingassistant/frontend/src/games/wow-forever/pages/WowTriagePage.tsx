import { useEffect } from "react";
import { Provider } from "react-redux";
import TriageFrameGuard from "@/games/wow-forever/components/featureRequests/triage/TriageFrameGuard";
import TriageUnlockForm from "@/games/wow-forever/components/featureRequests/triage/TriageUnlockForm";
import TriageWorkspace from "@/games/wow-forever/components/featureRequests/triage/TriageWorkspace";
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";
import { useTriageKey } from "@/games/wow-forever/hooks/featureRequests/triage/useTriageKey";
import { clearTriageData, triageStore } from "@/games/wow-forever/lib/featureRequests/triage/triageStore";

function TriageGate() {
  const { unlocked, lockReason } = useTriageKey();
  useEffect(() => {
    // Locked (Lock, idle, refused key): nothing private stays cached.
    if (!unlocked) clearTriageData();
  }, [unlocked]);
  return unlocked ? <TriageWorkspace /> : <TriageUnlockForm lockReason={lockReason} />;
}

/**
 * /wow-forever/triage — the operator's feature-request triage (own lazy chunk, linked from nowhere,
 * noindex). Refuses to run in a frame or the Discord Activity; otherwise asks for the triage key, kept in
 * memory only, and works against the token-gated triage API with its own store.
 */
export default function WowTriagePage() {
  useDocumentTitle(TRIAGE_COPY.pageTitle);
  return (
    <Provider store={triageStore}>
      <meta name="robots" content="noindex, nofollow" />
      <TriageFrameGuard>
        <TriageGate />
      </TriageFrameGuard>
    </Provider>
  );
}
