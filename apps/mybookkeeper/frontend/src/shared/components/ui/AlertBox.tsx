import type { ReactNode } from "react";

type AlertVariant = "info" | "warning" | "error" | "success";

interface AlertBoxProps {
  variant: AlertVariant;
  children: ReactNode;
  className?: string;
}

const VARIANT_STYLES: Record<AlertVariant, string> = {
  info: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-200",
  warning: "bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-950 dark:border-orange-800 dark:text-orange-200",
  error: "bg-red-50 border-red-200 text-red-600 dark:bg-red-950 dark:border-red-800 dark:text-red-300",
  success: "bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-200",
};

export default function AlertBox({ variant, children, className = "" }: AlertBoxProps) {
  return (
    <div className={`rounded-md border p-3 text-sm ${VARIANT_STYLES[variant]} ${className}`}>
      {children}
    </div>
  );
}
