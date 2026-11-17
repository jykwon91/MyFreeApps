import { Stack, useLocalSearchParams } from "expo-router";
import ArchivedReplyTemplateDetailScreen from "../../../../src/features/replyTemplates/ArchivedReplyTemplateDetailScreen";
import ValidRoute from "../../../../src/features/routing/ValidRoute";

export default function ArchivedReplyTemplateRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Archived Template", headerBackTitle: "Archived" }} />
      <ValidRoute uuids={["id"]}>
        <ArchivedReplyTemplateDetailScreen id={id} />
      </ValidRoute>
    </>
  );
}
