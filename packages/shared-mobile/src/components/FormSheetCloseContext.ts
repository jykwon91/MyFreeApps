import { createContext } from "react";
import type { FormSheetClose } from "../types/FormSheetClose";

export const FormSheetCloseContext = createContext<FormSheetClose | null>(null);
