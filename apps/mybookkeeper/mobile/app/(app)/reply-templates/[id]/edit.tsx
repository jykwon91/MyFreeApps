import { Stack, useLocalSearchParams } from "expo-router";
import ReplyTemplateEditScreen from "../../../../src/features/replyTemplates/ReplyTemplateEditScreen";

export default function ReplyTemplateEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Edit template", headerBackTitle: "Back" }} />
      <ReplyTemplateEditScreen id={id} />
    </>
  );
}
