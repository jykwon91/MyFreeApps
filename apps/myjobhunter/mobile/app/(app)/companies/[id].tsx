import { Stack, useLocalSearchParams } from "expo-router";
import { COMPANY_DETAIL_MESSAGES as MESSAGES } from "../../../src/constants/companyDetail";
import CompanyDetailScreen from "../../../src/features/companyDetail/CompanyDetailScreen";

export default function CompanyRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: MESSAGES.screenTitle, headerBackTitle: MESSAGES.backTitle }} />
      <CompanyDetailScreen id={id} />
    </>
  );
}
