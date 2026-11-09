import { EmptyState } from "@platform/mobile";
import { FORM_MESSAGES } from "../../constants/forms";
import { useCanWrite } from "../workspace/useCanWrite";
import LeaseTemplateFormScreen from "./LeaseTemplateFormScreen";

export default function LeaseTemplateCreateScreen() {
  const canWrite = useCanWrite();
  if (!canWrite) return <EmptyState body={FORM_MESSAGES.viewOnlyBody} heading={FORM_MESSAGES.viewOnlyHeading} />;
  return <LeaseTemplateFormScreen />;
}
