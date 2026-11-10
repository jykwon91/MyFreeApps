import { EmptyState } from "@platform/mobile";
import { router } from "expo-router";
import { PLACEHOLDER_MESSAGES as MESSAGES } from "../../constants/leasePlaceholderEdit";
import { LEASE_TEMPLATE_MESSAGES } from "../../constants/leaseTemplates";
import type { PlaceholderEditScreenProps } from "../../types/PlaceholderEditScreenProps";
import LeaseTemplateGate from "./LeaseTemplateGate";
import PlaceholderFormScreen from "./PlaceholderFormScreen";

/** One placeholder's edit screen: loads the template (so a refresh keeps working), then finds the placeholder in it. */
export default function PlaceholderEditScreen({ templateId, placeholderId }: PlaceholderEditScreenProps) {
  return (
    <LeaseTemplateGate id={templateId} requireWrite>
      {(template) => {
        const placeholder = template.placeholders.find((candidate) => candidate.id === placeholderId);
        if (!placeholder) {
          return <EmptyState action={{ label: LEASE_TEMPLATE_MESSAGES.back, onPress: () => router.back() }} body={MESSAGES.maybeChanged} heading={MESSAGES.cantFind} />;
        }
        return <PlaceholderFormScreen placeholder={placeholder} templateId={templateId} />;
      }}
    </LeaseTemplateGate>
  );
}
