import { Stack, useLocalSearchParams } from "expo-router";
import DocumentDetailScreen from "../../../src/features/documents/DocumentDetailScreen";

export default function DocumentRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Document", headerBackButtonDisplayMode: "minimal" }} />
      <DocumentDetailScreen id={id} />
    </>
  );
}
