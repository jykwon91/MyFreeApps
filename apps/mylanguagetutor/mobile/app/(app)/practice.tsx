import { Stack } from "expo-router";
import { CONVERSATION_SCREEN_TITLE } from "../../src/constants/conversation";
import ConversationScreen from "../../src/features/conversation/ConversationScreen";

export default function PracticeRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: CONVERSATION_SCREEN_TITLE }} />
      <ConversationScreen />
    </>
  );
}
