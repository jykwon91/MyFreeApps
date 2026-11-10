import WelcomeManualLoader from "./WelcomeManualLoader";
import WelcomeManualSectionsList from "./WelcomeManualSectionsList";

export default function WelcomeManualSectionsScreen({ id }: { id: string }) {
  return <WelcomeManualLoader id={id}>{(view) => <WelcomeManualSectionsList {...view} />}</WelcomeManualLoader>;
}
