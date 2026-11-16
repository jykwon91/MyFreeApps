import { useFormSheetClose } from "../hooks/useFormSheetClose";
import type { FormSheetCancelButtonProps } from "../types/FormSheetCancelButtonProps";
import LoadingButton from "./LoadingButton";

/** Cancel for a FormSheet: it closes the way Back does, asking first if anything would be lost. */
export default function FormSheetCancelButton({ children, disabled = false }: FormSheetCancelButtonProps) {
  const { requestClose, isBusy } = useFormSheetClose();
  return (
    <LoadingButton disabled={isBusy || disabled} onPress={requestClose} variant="ghost">
      {children}
    </LoadingButton>
  );
}
