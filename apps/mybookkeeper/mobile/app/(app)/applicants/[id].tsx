import { useGetApplicantByIdQuery } from "@mybookkeeper/api-client/store/applicantsApi";
import { isUuid } from "@platform/core/utils/isUuid";
import { Stack, useLocalSearchParams } from "expo-router";
import { CONTRACT_LOCKED_STAGE } from "../../../src/constants/applicants";
import ApplicantDetailScreen from "../../../src/features/applicants/ApplicantDetailScreen";
import ValidRoute from "../../../src/features/routing/ValidRoute";

export default function ApplicantRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { currentData: applicant } = useGetApplicantByIdQuery(id, { skip: !isUuid(id) });
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: applicant?.stage === CONTRACT_LOCKED_STAGE ? "Tenant" : "Applicant", headerBackTitle: "People" }} />
      <ValidRoute uuids={["id"]}>
        <ApplicantDetailScreen id={id} />
      </ValidRoute>
    </>
  );
}
