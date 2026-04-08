import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import type { ValidationSeverity } from "@/shared/types/tax/validation-result";

export const SEVERITY_ORDER: ValidationSeverity[] = ["error", "warning", "info"];

export const SEVERITY_CONFIG: Record<ValidationSeverity, {
  icon: typeof AlertCircle;
  containerClass: string;
  iconClass: string;
  label: string;
}> = {
  error: {
    icon: AlertCircle,
    containerClass: "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950",
    iconClass: "text-red-500",
    label: "Errors",
  },
  warning: {
    icon: AlertTriangle,
    containerClass: "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950",
    iconClass: "text-yellow-500",
    label: "Warnings",
  },
  info: {
    icon: Info,
    containerClass: "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950",
    iconClass: "text-blue-500",
    label: "Info",
  },
};
