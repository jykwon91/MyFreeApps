import { Stack, useLocalSearchParams } from "expo-router";
import ArchivedReplyTemplateDetailScreen from "../../../../src/features/replyTemplates/ArchivedReplyTemplateDetailScreen";

export default function ArchivedReplyTemplateRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Archived Template", headerBackTitle: "Archived" }} />
      <ArchivedReplyTemplateDetailScreen id={id} />
    </>
  );
}
