import { MAX_FIELDS_PER_SECTION } from "@mybookkeeper/api-client/constants/welcomeManualLimits";
import type { WelcomeManualSectionFieldResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-section-field-response";
import { useState } from "react";
import { WELCOME_MANUAL_FIELD_MESSAGES as MESSAGES } from "../../constants/welcomeManualForms";
import { useCanWrite } from "../workspace/useCanWrite";
import WelcomeManualFieldSheet from "./WelcomeManualFieldSheet";
import WelcomeManualFieldsReorder from "./WelcomeManualFieldsReorder";
import WelcomeManualItemList from "./WelcomeManualItemList";
import WelcomeManualItemRow from "./WelcomeManualItemRow";
import WelcomeManualSectionGate from "./WelcomeManualSectionGate";
import type { WelcomeManualSectionScreenProps } from "../../types/WelcomeManualSectionScreenProps";
import type { WelcomeManualEditing } from "../../types/WelcomeManualEditing";

export default function WelcomeManualFieldsScreen({ manualId, sectionId }: WelcomeManualSectionScreenProps) {
  const canWrite = useCanWrite();
  const [editing, setEditing] = useState<WelcomeManualEditing<WelcomeManualSectionFieldResponse>>(null);
  const [isReordering, setIsReordering] = useState(false);
  return (
    <WelcomeManualSectionGate manualId={manualId} sectionId={sectionId}>
      {({ refreshControl }, section) => (
        <>
          <WelcomeManualItemList
            addLabel={MESSAGES.add}
            atLimit={MESSAGES.atLimit}
            canAdd={section.fields.length < MAX_FIELDS_PER_SECTION}
            emptyBody={MESSAGES.hint}
            emptyHeading={MESSAGES.none}
            hint={section.fields.length > 0 ? MESSAGES.hint : undefined}
            items={section.fields}
            keyOf={(field) => field.id}
            onAdd={() => setEditing("new")}
            onReorder={() => setIsReordering(true)}
            refreshControl={refreshControl}
            renderItem={(field) => (
              <WelcomeManualItemRow accessibilityLabel={`${field.label}, ${field.value ?? "no value"}`} onPress={canWrite ? () => setEditing(field) : undefined} subtitle={field.value} title={field.label} />
            )}
            reorderLabel={MESSAGES.reorder}
            testID="welcome-manual-fields-list"
          />
          {editing ? <WelcomeManualFieldSheet field={editing === "new" ? null : editing} manualId={manualId} onClose={() => setEditing(null)} sectionId={sectionId} /> : null}
          {isReordering ? <WelcomeManualFieldsReorder manualId={manualId} onClose={() => setIsReordering(false)} section={section} /> : null}
        </>
      )}
    </WelcomeManualSectionGate>
  );
}
