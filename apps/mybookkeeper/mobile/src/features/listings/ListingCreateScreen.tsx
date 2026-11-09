import { EmptyState } from "@platform/mobile";
import { FORM_MESSAGES } from "../../constants/forms";
import { useCanWrite } from "../workspace/useCanWrite";
import ListingFormScreen from "./ListingFormScreen";

export default function ListingCreateScreen() {
  const canWrite = useCanWrite();
  if (!canWrite) return <EmptyState body={FORM_MESSAGES.viewOnlyBody} heading={FORM_MESSAGES.viewOnlyHeading} />;
  return <ListingFormScreen original={null} />;
}
