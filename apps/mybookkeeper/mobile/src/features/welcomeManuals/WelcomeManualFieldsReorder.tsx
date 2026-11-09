import { useReorderSectionFieldsMutation } from "@mybookkeeper/api-client/store/welcomeManualsApi";
import type { WelcomeManualSectionResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-section-response";
import { WELCOME_MANUAL_FIELD_MESSAGES } from "../../constants/welcomeManualForms";
import WelcomeManualReorderSheet from "./WelcomeManualReorderSheet";
import { FIELD_WORDS } from "../../constants/welcomeManualSheets";

interface WelcomeManualFieldsReorderProps {
  manualId: string;
  section: WelcomeManualSectionResponse;
  onClose: () => void;
}

export default function WelcomeManualFieldsReorder({ manualId, section, onClose }: WelcomeManualFieldsReorderProps) {
  const [reorderFields] = useReorderSectionFieldsMutation();
  return (
    <WelcomeManualReorderSheet
      items={section.fields.map((field) => ({ id: field.id, label: field.label }))}
      onClose={onClose}
      reorder={(fieldIds) => reorderFields({ manualId, sectionId: section.id, fieldIds }).unwrap()}
      title={WELCOME_MANUAL_FIELD_MESSAGES.reorderTitle}
      words={FIELD_WORDS}
    />
  );
}
