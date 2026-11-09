import { EmptyState } from "@platform/mobile";
import { UTILITY_PLAN_FORM_MESSAGES as MESSAGES } from "../../constants/utilityPlanForm";
import { useCanWrite } from "../workspace/useCanWrite";
import UtilityPlanForm from "./UtilityPlanForm";

export default function UtilityPlanFormScreen() {
  const canWrite = useCanWrite();
  if (!canWrite) return <EmptyState body={MESSAGES.viewOnlyBody} heading={MESSAGES.viewOnlyHeading} />;
  return <UtilityPlanForm original={null} />;
}
