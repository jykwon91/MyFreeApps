import type { Document } from "@mybookkeeper/api-client/types/document/document";
import { LoadingButton } from "@platform/mobile";
import { REFERENCE_ONLY_MESSAGES as MESSAGES } from "../../constants/documents";
import { useReferenceOnly } from "./useReferenceOnly";

export default function ReferenceOnlyButton({ document }: { document: Document }) {
  const { toggle, isToggling, isReferenceOnly } = useReferenceOnly(document);
  return (
    <LoadingButton
      isLoading={isToggling}
      loadingText={isReferenceOnly ? MESSAGES.unmarking : MESSAGES.marking}
      onPress={toggle}
      variant="secondary"
    >
      {isReferenceOnly ? MESSAGES.unmark : MESSAGES.mark}
    </LoadingButton>
  );
}
