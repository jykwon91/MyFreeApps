import WelcomeManualLoader from "./WelcomeManualLoader";
import WelcomeManualShareBody from "./WelcomeManualShareBody";
import type { WelcomeManualScreenProps } from "../../types/WelcomeManualScreenProps";

export default function WelcomeManualShareScreen({ manualId }: WelcomeManualScreenProps) {
  return <WelcomeManualLoader id={manualId}>{(view) => <WelcomeManualShareBody {...view} />}</WelcomeManualLoader>;
}
