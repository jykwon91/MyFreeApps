import { Stack, useLocalSearchParams } from "expo-router";
import InquiryDetailScreen from "../../../../src/features/inquiries/InquiryDetailScreen";
import ValidRoute from "../../../../src/features/routing/ValidRoute";

export default function InquiryRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Inquiry", headerBackTitle: "People" }} />
      <ValidRoute uuids={["id"]}>
        <InquiryDetailScreen id={id} />
      </ValidRoute>
    </>
  );
}
