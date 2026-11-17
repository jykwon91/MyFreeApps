import { Stack, useLocalSearchParams } from "expo-router";
import LeaseTemplateDetailScreen from "../../../../src/features/leaseTemplates/LeaseTemplateDetailScreen";
import ValidRoute from "../../../../src/features/routing/ValidRoute";

export default function LeaseTemplateRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Template", headerBackTitle: "Templates" }} />
      <ValidRoute uuids={["id"]}>
        <LeaseTemplateDetailScreen id={id} />
      </ValidRoute>
    </>
  );
}
