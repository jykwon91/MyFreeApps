import { Redirect, useLocalSearchParams } from "expo-router";
import { PRACTICE_PATH } from "../../constants/routes";
import ProfileGate from "../onboarding/ProfileGate";
import ConversationLoader from "./ConversationLoader";

/** `/practice?scenario=<slug>`: a typed conversation in one scenario. Without one, back to the list, as on the website. */
export default function ConversationScreen() {
  const { scenario } = useLocalSearchParams<{ scenario?: string }>();
  if (!scenario) return <Redirect href={PRACTICE_PATH} />;
  return <ProfileGate>{(profile) => <ConversationLoader profile={profile} scenarioSlug={scenario} />}</ProfileGate>;
}
