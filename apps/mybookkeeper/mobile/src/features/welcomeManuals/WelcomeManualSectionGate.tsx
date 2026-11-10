import { EmptyState } from "@platform/mobile";
import { WELCOME_MANUAL_SECTION_MESSAGES } from "../../constants/welcomeManualForms";
import { WELCOME_MANUAL_MESSAGES } from "../../constants/welcomeManuals";
import { goBackOr } from "../../lib/goBackOr";
import type { WelcomeManualSectionGateProps } from "../../types/WelcomeManualSectionGateProps";
import WelcomeManualLoader from "./WelcomeManualLoader";

/** Opens one section of a manual, or says it's gone when someone has deleted it. */
export default function WelcomeManualSectionGate({ manualId, sectionId, requireWrite = false, isLeaving = false, children }: WelcomeManualSectionGateProps) {
  return (
    <WelcomeManualLoader id={manualId} isLeaving={isLeaving} requireWrite={requireWrite}>
      {(view) => {
        const section = view.manual.sections.find((candidate) => candidate.id === sectionId);
        if (!section) {
          return (
            <EmptyState
              action={{ label: WELCOME_MANUAL_MESSAGES.back, onPress: () => goBackOr(`/welcome-manuals/${manualId}`) }}
              body={WELCOME_MANUAL_MESSAGES.maybeDeleted}
              heading={WELCOME_MANUAL_SECTION_MESSAGES.cantFind}
            />
          );
        }
        return children(view, section);
      }}
    </WelcomeManualLoader>
  );
}
