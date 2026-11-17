import { Stack, useLocalSearchParams } from "expo-router";
import { PLACEHOLDER_MESSAGES } from "../../../../../src/constants/leasePlaceholderEdit";
import LeaseTemplatePlaceholdersScreen from "../../../../../src/features/leaseTemplates/LeaseTemplatePlaceholdersScreen";
import ValidRoute from "../../../../../src/features/routing/ValidRoute";

export default function LeaseTemplatePlaceholdersRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: PLACEHOLDER_MESSAGES.heading, headerBackTitle: "Template" }} />
      <ValidRoute uuids={["id"]}>
        <LeaseTemplatePlaceholdersScreen id={id} />
      </ValidRoute>
    </>
  );
}
