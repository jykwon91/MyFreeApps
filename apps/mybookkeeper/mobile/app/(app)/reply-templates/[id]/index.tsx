import { Stack, useLocalSearchParams } from "expo-router";
import ReplyTemplateDetailScreen from "../../../../src/features/replyTemplates/ReplyTemplateDetailScreen";
import ValidRoute from "../../../../src/features/routing/ValidRoute";

export default function ReplyTemplateRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Template", headerBackTitle: "Templates" }} />
      <ValidRoute uuids={["id"]}>
        <ReplyTemplateDetailScreen id={id} />
      </ValidRoute>
    </>
  );
}
