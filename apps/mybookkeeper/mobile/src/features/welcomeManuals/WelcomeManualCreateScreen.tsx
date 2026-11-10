import { EmptyState } from "@platform/mobile";
import { FORM_MESSAGES } from "../../constants/forms";
import { useCanWrite } from "../workspace/useCanWrite";
import WelcomeManualFormScreen from "./WelcomeManualFormScreen";

export default function WelcomeManualCreateScreen() {
  const canWrite = useCanWrite();
  if (!canWrite) return <EmptyState body={FORM_MESSAGES.viewOnlyBody} heading={FORM_MESSAGES.viewOnlyHeading} />;
  return <WelcomeManualFormScreen original={null} />;
}
