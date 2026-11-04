import { createContext } from "react";
import type { ToastContextValue } from "../types/ToastContextValue";

export const ToastContext = createContext<ToastContextValue | null>(null);
