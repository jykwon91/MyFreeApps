import { useContext } from "react";
import { ToastContext } from "../components/ToastContext";
import type { ToastContextValue } from "../types/ToastContextValue";

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast needs a ToastProvider above it");
  return value;
}
