import { Stack, useLocalSearchParams } from "expo-router";
import ReplyTemplateDetailScreen from "../../../../src/features/replyTemplates/ReplyTemplateDetailScreen";

export default function ReplyTemplateRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Template", headerBackTitle: "Templates" }} />
      <ReplyTemplateDetailScreen id={id} />
    </>
  );
}
