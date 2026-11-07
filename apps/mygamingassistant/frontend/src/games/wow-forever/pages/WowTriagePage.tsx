import TriageAuthGate from "@/games/wow-forever/components/featureRequests/triage/TriageAuthGate";
import TriageFrameGuard from "@/games/wow-forever/components/featureRequests/triage/TriageFrameGuard";
import TriageWorkspace from "@/games/wow-forever/components/featureRequests/triage/TriageWorkspace";
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";

/**
 * /wow-forever/triage — the operator's feature-request triage (own lazy chunk, linked from nowhere,
 * noindex). Refuses to run in a frame or the Discord Activity; otherwise needs the operator's normal
 * sign-in (signed out → /login and back here) and talks to the superuser-only triage API through the
 * app's `baseApi`.
 */
export default function WowTriagePage() {
  useDocumentTitle(TRIAGE_COPY.pageTitle);
  return (
    <>
      <meta name="robots" content="noindex, nofollow" />
      <TriageFrameGuard>
        <TriageAuthGate>
          <TriageWorkspace />
        </TriageAuthGate>
      </TriageFrameGuard>
    </>
  );
}
