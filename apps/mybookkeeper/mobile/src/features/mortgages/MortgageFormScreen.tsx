import { EmptyState } from "@platform/mobile";
import { MORTGAGE_FORM_MESSAGES as MESSAGES } from "../../constants/mortgageForm";
import { useCanWrite } from "../workspace/useCanWrite";
import MortgageForm from "./MortgageForm";

export default function MortgageFormScreen() {
  const canWrite = useCanWrite();
  if (!canWrite) return <EmptyState body={MESSAGES.viewOnlyBody} heading={MESSAGES.viewOnlyHeading} />;
  return <MortgageForm original={null} />;
}
