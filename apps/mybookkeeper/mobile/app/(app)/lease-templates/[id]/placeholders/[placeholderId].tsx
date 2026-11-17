import { Stack, useLocalSearchParams } from "expo-router";
import { PLACEHOLDER_MESSAGES } from "../../../../../src/constants/leasePlaceholderEdit";
import PlaceholderEditScreen from "../../../../../src/features/leaseTemplates/PlaceholderEditScreen";
import ValidRoute from "../../../../../src/features/routing/ValidRoute";

export default function PlaceholderEditRoute() {
  const { id, placeholderId } = useLocalSearchParams<{ id: string; placeholderId: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: PLACEHOLDER_MESSAGES.editTitle, headerBackTitle: "Placeholders" }} />
      <ValidRoute uuids={["id", "placeholderId"]}>
        <PlaceholderEditScreen placeholderId={placeholderId} templateId={id} />
      </ValidRoute>
    </>
  );
}
