import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "@/shared/lib/api";
import type { PublicWelcomeManualResponse } from "@/shared/types/welcome-manual/public-welcome-manual-response";
import WelcomeManualPreview from "@/app/features/welcome-manuals/WelcomeManualPreview";
import PublicWelcomeManualPinForm, {
  type PublicWelcomeManualUnlockResult,
} from "@/app/features/welcome-manuals/PublicWelcomeManualPinForm";
import PublicWelcomeManualGateSkeleton from "@/app/features/welcome-manuals/PublicWelcomeManualGateSkeleton";
import {
  mapPublicPlacesToPreview,
  mapPublicSectionsToPreview,
} from "@/app/features/welcome-manuals/public-welcome-manual-preview-mapper";
import {
  GATE_PHASE,
  type GatePhase,
} from "@/app/features/welcome-manuals/public-welcome-manual-gate-phase";

function unlockErrorKind(err: unknown): "invalid" | "rate-limited" | "unknown" {
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === 401) return "invalid";
  if (status === 429) return "rate-limited";
  return "unknown";
}

/**
 * Public, unauthenticated guest page for a shared welcome manual. The manual
 * holds Wi-Fi / check-in details, so nothing beyond the PIN form renders
 * until the guest submits the correct code. v1 intentionally has no guest
 * session — a page refresh re-prompts for the PIN.
 */
export default function PublicWelcomeManual() {
  const { token = "" } = useParams<{ token: string }>();
  const [phase, setPhase] = useState<GatePhase>(GATE_PHASE.LOADING);
  const [manual, setManual] = useState<PublicWelcomeManualResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/public/welcome-manuals/${token}`)
      .then(() => {
        if (!cancelled) setPhase(GATE_PHASE.LOCKED);
      })
      .catch(() => {
        if (!cancelled) setPhase(GATE_PHASE.NOT_ACTIVE);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleUnlock(pin: string): Promise<PublicWelcomeManualUnlockResult> {
    try {
      const { data } = await api.post<PublicWelcomeManualResponse>(
        `/public/welcome-manuals/${token}/unlock`,
        { pin },
      );
      setManual(data);
      return { success: true };
    } catch (err) {
      return { success: false, error: unlockErrorKind(err) };
    }
  }

  if (manual) {
    return (
      <div className="min-h-screen bg-muted py-6 sm:py-12">
        <div className="mx-auto max-w-2xl px-4">
          <WelcomeManualPreview
            title={manual.title}
            introText={null}
            sections={mapPublicSectionsToPreview(manual.sections)}
            places={mapPublicPlacesToPreview(manual.places)}
          />
        </div>
      </div>
    );
  }

  if (phase === GATE_PHASE.LOADING) {
    return <PublicWelcomeManualGateSkeleton />;
  }

  if (phase === GATE_PHASE.NOT_ACTIVE) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted px-4">
        <div
          className="bg-card border rounded-lg p-8 w-full max-w-sm shadow-sm text-center"
          data-testid="public-welcome-manual-not-active"
        >
          <h1 className="text-xl font-semibold mb-2">This guide link isn't active</h1>
          <p className="text-sm text-muted-foreground">Ask your host for an updated link.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted px-4">
      <PublicWelcomeManualPinForm onSubmit={handleUnlock} />
    </div>
  );
}
