import { Stack, useLocalSearchParams } from "expo-router";
import { PLACEHOLDER_MESSAGES } from "../../../../../src/constants/leasePlaceholderEdit";
import PlaceholderEditScreen from "../../../../../src/features/leaseTemplates/PlaceholderEditScreen";

export default function PlaceholderEditRoute() {
  const { id, placeholderId } = useLocalSearchParams<{ id: string; placeholderId: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: PLACEHOLDER_MESSAGES.editTitle, headerBackTitle: "Placeholders" }} />
      <PlaceholderEditScreen placeholderId={placeholderId} templateId={id} />
    </>
  );
}
