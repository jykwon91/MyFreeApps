import { Stack, useLocalSearchParams } from "expo-router";
import InquiryReplyScreen from "../../../../src/features/inquiries/InquiryReplyScreen";
import ValidRoute from "../../../../src/features/routing/ValidRoute";

export default function InquiryReplyRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Reply", headerBackTitle: "Cancel" }} />
      <ValidRoute uuids={["id"]}>
        <InquiryReplyScreen id={id} />
      </ValidRoute>
    </>
  );
}
