import { Stack, useLocalSearchParams } from "expo-router";
import AddDocumentPickScreen from "../../../../../src/features/leases/AddDocumentPickScreen";
import ValidRoute from "../../../../../src/features/routing/ValidRoute";

export default function AddDocumentRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Add a document", headerBackTitle: "Cancel" }} />
      <ValidRoute uuids={["id"]}>
        <AddDocumentPickScreen leaseId={id} />
      </ValidRoute>
    </>
  );
}
