import { EmptyState } from "@platform/mobile";
import { router } from "expo-router";
import { INSURANCE_MESSAGES } from "../../constants/insurance";
import { useCanWrite } from "../workspace/useCanWrite";
import PolicyForm from "./PolicyForm";

export default function NewPolicyScreen() {
  const canWrite = useCanWrite();
  if (!canWrite) return <EmptyState action={{ label: INSURANCE_MESSAGES.back, onPress: () => router.back() }} body={INSURANCE_MESSAGES.notAllowedBody} heading={INSURANCE_MESSAGES.notAllowed} />;
  return <PolicyForm />;
}
