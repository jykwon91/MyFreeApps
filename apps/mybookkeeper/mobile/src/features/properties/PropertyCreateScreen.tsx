import { EmptyState } from "@platform/mobile";
import { FORM_MESSAGES } from "../../constants/forms";
import { useCanWrite } from "../workspace/useCanWrite";
import PropertyFormScreen from "./PropertyFormScreen";

export default function PropertyCreateScreen() {
  const canWrite = useCanWrite();
  if (!canWrite) return <EmptyState body={FORM_MESSAGES.viewOnlyBody} heading={FORM_MESSAGES.viewOnlyHeading} />;
  return <PropertyFormScreen original={null} />;
}
