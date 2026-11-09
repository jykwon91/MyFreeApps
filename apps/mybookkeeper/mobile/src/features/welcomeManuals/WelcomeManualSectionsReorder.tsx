import { useReorderSectionsMutation } from "@mybookkeeper/api-client/store/welcomeManualsApi";
import type { WelcomeManualResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-response";
import { WELCOME_MANUAL_SECTION_MESSAGES } from "../../constants/welcomeManualForms";
import WelcomeManualReorderSheet from "./WelcomeManualReorderSheet";
import { SECTION_WORDS } from "../../constants/welcomeManualSheets";

interface WelcomeManualSectionsReorderProps {
  manual: WelcomeManualResponse;
  onClose: () => void;
}

export default function WelcomeManualSectionsReorder({ manual, onClose }: WelcomeManualSectionsReorderProps) {
  const [reorderSections] = useReorderSectionsMutation();
  return (
    <WelcomeManualReorderSheet
      items={manual.sections.map((section) => ({ id: section.id, label: section.title }))}
      onClose={onClose}
      reorder={(sectionIds) => reorderSections({ manualId: manual.id, sectionIds }).unwrap()}
      title={WELCOME_MANUAL_SECTION_MESSAGES.reorderTitle}
      words={SECTION_WORDS}
    />
  );
}
