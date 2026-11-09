import { EmptyState } from "@platform/mobile";
import { WELCOME_MANUAL_EMAIL_MESSAGES as MESSAGES } from "../../constants/welcomeManualForms";
import WelcomeManualEmailForm from "./WelcomeManualEmailForm";
import WelcomeManualLoader from "./WelcomeManualLoader";
import type { WelcomeManualScreenProps } from "../../types/WelcomeManualScreenProps";

export default function WelcomeManualEmailScreen({ manualId }: WelcomeManualScreenProps) {
  return (
    <WelcomeManualLoader id={manualId} requireWrite>
      {({ manual, refreshControl }) =>
        manual.sections.length === 0 ? <EmptyState body="" heading={MESSAGES.noSections} /> : <WelcomeManualEmailForm manual={manual} refreshControl={refreshControl} />
      }
    </WelcomeManualLoader>
  );
}
