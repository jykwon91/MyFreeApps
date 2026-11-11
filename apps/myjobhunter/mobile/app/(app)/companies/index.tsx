import { Stack } from "expo-router";
import { COMPANY_MESSAGES as MESSAGES } from "../../../src/constants/companies";
import CompaniesScreen from "../../../src/features/companies/CompaniesScreen";

export default function CompaniesRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: MESSAGES.screenTitle, headerBackTitle: MESSAGES.backTitle }} />
      <CompaniesScreen />
    </>
  );
}
