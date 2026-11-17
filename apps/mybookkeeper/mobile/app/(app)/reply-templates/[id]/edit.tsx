import { Stack, useLocalSearchParams } from "expo-router";
import ReplyTemplateEditScreen from "../../../../src/features/replyTemplates/ReplyTemplateEditScreen";
import ValidRoute from "../../../../src/features/routing/ValidRoute";

export default function ReplyTemplateEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Edit template", headerBackTitle: "Back" }} />
      <ValidRoute uuids={["id"]}>
        <ReplyTemplateEditScreen id={id} />
      </ValidRoute>
    </>
  );
}
