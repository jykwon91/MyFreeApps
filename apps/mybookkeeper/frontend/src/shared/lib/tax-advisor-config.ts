import { AlertTriangle, Info } from "lucide-react";
import type { BadgeColor } from "@/shared/components/ui/Badge";
import type { TaxSuggestion } from "@/shared/types/tax/tax-advisor";

export type Severity = TaxSuggestion["severity"];
export type Confidence = TaxSuggestion["confidence"];

export const CONFIDENCE_COLOR: Record<Confidence, BadgeColor> = {
  high: "green",
  medium: "yellow",
  low: "gray",
};

export const SEVERITY_ORDER: Severity[] = ["high", "medium", "low"];

export const SEVERITY_CONFIG: Record<Severity, {
  icon: typeof AlertTriangle;
  containerClass: string;
  iconClass: string;
  badgeColor: BadgeColor;
  label: string;
}> = {
  high: {
    icon: AlertTriangle,
    containerClass: "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950",
    iconClass: "text-red-500",
    badgeColor: "red",
    label: "High",
  },
  medium: {
    icon: Info,
    containerClass: "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950",
    iconClass: "text-yellow-500",
    badgeColor: "yellow",
    label: "Medium",
  },
  low: {
    icon: Info,
    containerClass: "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950",
    iconClass: "text-blue-500",
    badgeColor: "blue",
    label: "Low",
  },
};
