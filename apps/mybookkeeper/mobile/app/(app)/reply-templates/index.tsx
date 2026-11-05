import { Stack } from "expo-router";
import ReplyTemplatesScreen from "../../../src/features/replyTemplates/ReplyTemplatesScreen";

export default function ReplyTemplatesRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Reply Templates", headerBackTitle: "More" }} />
      <ReplyTemplatesScreen />
    </>
  );
}
