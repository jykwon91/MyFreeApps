import { Stack, useLocalSearchParams } from "expo-router";
import ApplicantDetailScreen from "../../../src/features/applicants/ApplicantDetailScreen";

export default function ApplicantRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Applicant", headerBackTitle: "People" }} />
      <ApplicantDetailScreen id={id} />
    </>
  );
}
