import { Stack } from "expo-router";
import ReplyTemplateCreateScreen from "../../../src/features/replyTemplates/ReplyTemplateCreateScreen";

export default function ReplyTemplateNewRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "New template", headerBackTitle: "Back" }} />
      <ReplyTemplateCreateScreen />
    </>
  );
}
