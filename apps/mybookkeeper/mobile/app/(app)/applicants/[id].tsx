import { useGetApplicantByIdQuery } from "@mybookkeeper/api-client/store/applicantsApi";
import { Stack, useLocalSearchParams } from "expo-router";
import { CONTRACT_LOCKED_STAGE } from "../../../src/constants/applicants";
import ApplicantDetailScreen from "../../../src/features/applicants/ApplicantDetailScreen";

export default function ApplicantRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { currentData: applicant } = useGetApplicantByIdQuery(id);
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: applicant?.stage === CONTRACT_LOCKED_STAGE ? "Tenant" : "Applicant", headerBackTitle: "People" }} />
      <ApplicantDetailScreen id={id} />
    </>
  );
}
