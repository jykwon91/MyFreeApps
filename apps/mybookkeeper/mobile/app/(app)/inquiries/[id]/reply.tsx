import { Stack, useLocalSearchParams } from "expo-router";
import InquiryReplyScreen from "../../../../src/features/inquiries/InquiryReplyScreen";

export default function InquiryReplyRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Reply", headerBackTitle: "Cancel" }} />
      <InquiryReplyScreen id={id} />
    </>
  );
}
