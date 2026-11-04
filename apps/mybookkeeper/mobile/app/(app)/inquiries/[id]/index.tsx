import { Stack, useLocalSearchParams } from "expo-router";
import InquiryDetailScreen from "../../../../src/features/inquiries/InquiryDetailScreen";

export default function InquiryRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Inquiry", headerBackTitle: "People" }} />
      <InquiryDetailScreen id={id} />
    </>
  );
}
