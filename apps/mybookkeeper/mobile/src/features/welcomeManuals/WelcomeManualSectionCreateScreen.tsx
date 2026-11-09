import WelcomeManualLoader from "./WelcomeManualLoader";
import WelcomeManualSectionFormScreen from "./WelcomeManualSectionFormScreen";
import type { WelcomeManualScreenProps } from "../../types/WelcomeManualScreenProps";

export default function WelcomeManualSectionCreateScreen({ manualId }: WelcomeManualScreenProps) {
  return <WelcomeManualLoader id={manualId} requireWrite>{({ manual }) => <WelcomeManualSectionFormScreen manual={manual} original={null} />}</WelcomeManualLoader>;
}
