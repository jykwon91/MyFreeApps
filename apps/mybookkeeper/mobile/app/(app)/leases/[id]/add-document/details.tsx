import { Stack, useLocalSearchParams } from "expo-router";
import AddDocumentValuesScreen from "../../../../../src/features/leases/AddDocumentValuesScreen";
import { templateIdsFromParam } from "../../../../../src/features/leases/addDocumentFlow";
import ValidRoute from "../../../../../src/features/routing/ValidRoute";

export default function AddDocumentDetailsRoute() {
  const { id, template_ids } = useLocalSearchParams<{ id: string; template_ids?: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Add a document", headerBackTitle: "Back" }} />
      <ValidRoute uuids={["id"]}>
        <AddDocumentValuesScreen leaseId={id} templateIds={templateIdsFromParam(template_ids)} />
      </ValidRoute>
    </>
  );
}
