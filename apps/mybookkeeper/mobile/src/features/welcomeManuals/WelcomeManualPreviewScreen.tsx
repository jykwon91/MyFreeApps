import WelcomeManualLoader from "./WelcomeManualLoader";
import WelcomeManualPreviewBody from "./WelcomeManualPreviewBody";
import type { WelcomeManualScreenProps } from "../../types/WelcomeManualScreenProps";

export default function WelcomeManualPreviewScreen({ manualId }: WelcomeManualScreenProps) {
  return <WelcomeManualLoader id={manualId}>{(view) => <WelcomeManualPreviewBody {...view} />}</WelcomeManualLoader>;
}
