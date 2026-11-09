import { EmptyState } from "@platform/mobile";
import { FORM_MESSAGES } from "../../constants/forms";
import { useCanWrite } from "../workspace/useCanWrite";
import ReconciliationAddForm from "./ReconciliationAddForm";

export default function ReconciliationAddScreen({ year }: { year: number }) {
  const canWrite = useCanWrite();
  if (!canWrite) return <EmptyState body={FORM_MESSAGES.viewOnlyBody} heading={FORM_MESSAGES.viewOnlyHeading} />;
  return <ReconciliationAddForm year={year} />;
}
