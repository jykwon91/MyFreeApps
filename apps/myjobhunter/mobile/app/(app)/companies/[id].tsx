import { Stack, useLocalSearchParams } from "expo-router";
import { COMPANY_DETAIL_MESSAGES as MESSAGES } from "../../../src/constants/companyDetail";
import CompanyDetailScreen from "../../../src/features/companyDetail/CompanyDetailScreen";
import ValidRoute from "../../../src/features/routing/ValidRoute";

export default function CompanyRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: MESSAGES.screenTitle, headerBackTitle: MESSAGES.backTitle }} />
      <ValidRoute uuids={["id"]}>
        <CompanyDetailScreen id={id} />
      </ValidRoute>
    </>
  );
}
