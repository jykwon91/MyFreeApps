import { AlertTriangle, AlertCircle, Info, ShieldAlert } from "lucide-react";
import type { BadgeColor } from "@/shared/components/ui/Badge";

export const SEVERITY_BADGE_COLOR: Record<string, BadgeColor> = {
  critical: "red",
  error: "red",
  warning: "yellow",
  info: "blue",
};

export function severityIcon(severity: string) {
  switch (severity) {
    case "critical":
      return <ShieldAlert className="h-5 w-5 text-red-500 shrink-0" />;
    case "error":
      return <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />;
    case "warning":
      return <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />;
    default:
      return <Info className="h-5 w-5 text-blue-500 shrink-0" />;
  }
}

export function severityBorder(severity: string): string {
  switch (severity) {
    case "critical":
    case "error":
      return "border-l-red-500";
    case "warning":
      return "border-l-yellow-500";
    default:
      return "border-l-blue-500";
  }
}
