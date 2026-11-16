import { useContext } from "react";
import { FormSheetCloseContext } from "../components/FormSheetCloseContext";
import type { FormSheetClose } from "../types/FormSheetClose";

/** The sheet's own close, for a Cancel button inside it, so Cancel and Back ask the same question. */
export function useFormSheetClose(): FormSheetClose {
  const value = useContext(FormSheetCloseContext);
  if (!value) throw new Error("useFormSheetClose needs a FormSheet above it");
  return value;
}
