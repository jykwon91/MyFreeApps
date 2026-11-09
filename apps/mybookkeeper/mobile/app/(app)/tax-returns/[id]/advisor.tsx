import { Stack, useLocalSearchParams } from "expo-router";
import { TAX_ADVISOR_MESSAGES as MESSAGES } from "../../../../src/constants/taxAdvisor";
import TaxAdvisorScreen from "../../../../src/features/taxReturns/TaxAdvisorScreen";

export default function TaxAdvisorRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: MESSAGES.title, headerBackTitle: MESSAGES.headerBackTitle }} />
      <TaxAdvisorScreen returnId={id} />
    </>
  );
}
