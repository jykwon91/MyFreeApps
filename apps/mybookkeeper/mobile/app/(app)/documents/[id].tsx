import { Stack, useLocalSearchParams } from "expo-router";
import DocumentDetailScreen from "../../../src/features/documents/DocumentDetailScreen";
import ValidRoute from "../../../src/features/routing/ValidRoute";

export default function DocumentRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Document", headerBackButtonDisplayMode: "minimal" }} />
      <ValidRoute uuids={["id"]}>
        <DocumentDetailScreen id={id} />
      </ValidRoute>
    </>
  );
}
