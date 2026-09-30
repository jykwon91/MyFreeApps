import ProfileGate from "@/features/onboarding/ProfileGate";
import ScenarioPath from "@/features/catalog/ScenarioPath";

/** /scenarios -- pick what to practice. */
export default function Scenarios() {
  return (
    <div className="p-6 max-w-2xl">
      <ProfileGate>{(profile) => <ScenarioPath profile={profile} />}</ProfileGate>
    </div>
  );
}
