import ProfileGate from "../onboarding/ProfileGate";
import ScenarioList from "./ScenarioList";

/** The Practice tab: the website's / and /scenarios, behind its profile gate. */
export default function PracticeScreen() {
  return <ProfileGate>{(profile) => <ScenarioList profile={profile} />}</ProfileGate>;
}
