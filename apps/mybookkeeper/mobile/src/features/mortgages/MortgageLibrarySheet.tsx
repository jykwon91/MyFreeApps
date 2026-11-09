import { useGetDocumentsQuery } from "@mybookkeeper/api-client/store/documentsApi";
import { OptionSheet } from "@platform/mobile";
import { useMemo } from "react";
import { MORTGAGE_STATEMENT_MESSAGES as MESSAGES } from "../../constants/mortgageForm";

interface MortgageLibrarySheetProps {
  isOpen: boolean;
  onClose: () => void;
  onPick: (documentId: string, name: string) => void;
}

/** A document already in the library, as the other way to read a statement. */
export default function MortgageLibrarySheet({ isOpen, onClose, onPick }: MortgageLibrarySheetProps) {
  const { data } = useGetDocumentsQuery({ excludeProcessing: true }, { skip: !isOpen });
  const options = useMemo(
    () => (data ?? []).map((document) => ({ value: document.id, label: document.file_name ?? MESSAGES.untitled })),
    [data],
  );
  return (
    <OptionSheet
      emptyText={MESSAGES.libraryEmpty}
      isOpen={isOpen}
      onClose={onClose}
      onSelect={(documentId) => onPick(documentId, options.find((option) => option.value === documentId)?.label ?? MESSAGES.untitled)}
      options={options}
      title={MESSAGES.librarySheetTitle}
      value=""
    />
  );
}
