import { Stack } from "expo-router";
import ArchivedReplyTemplatesScreen from "../../../../src/features/replyTemplates/ArchivedReplyTemplatesScreen";

export default function ArchivedReplyTemplatesRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Archived Templates", headerBackTitle: "Templates" }} />
      <ArchivedReplyTemplatesScreen />
    </>
  );
}
