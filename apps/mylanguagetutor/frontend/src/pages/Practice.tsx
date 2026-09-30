import { Navigate, useSearchParams } from "react-router-dom";
import ProfileGate from "@/features/onboarding/ProfileGate";
import PracticeLoader from "@/features/session/PracticeLoader";

/** /practice?scenario=<slug> -- the voice conversation. */
export default function Practice() {
  const [params] = useSearchParams();
  const scenarioSlug = params.get("scenario");
  if (!scenarioSlug) return <Navigate to="/scenarios" replace />;
  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      <ProfileGate>
        {(profile) => <PracticeLoader profile={profile} scenarioSlug={scenarioSlug} />}
      </ProfileGate>
    </div>
  );
}
