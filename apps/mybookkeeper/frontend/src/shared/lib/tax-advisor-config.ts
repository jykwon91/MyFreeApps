import { AlertTriangle, Info } from "lucide-react";
import type { BadgeColor } from "@/shared/components/ui/Badge";
import type { SuggestionConfidence } from "@mybookkeeper/api-client/types/tax/SuggestionConfidence";
import type { SuggestionSeverity } from "@mybookkeeper/api-client/types/tax/SuggestionSeverity";
import { SUGGESTION_SEVERITY_LABELS } from "@mybookkeeper/api-client/constants/taxAdvisor";

export const CONFIDENCE_COLOR: Record<SuggestionConfidence, BadgeColor> = {
  high: "green",
  medium: "yellow",
  low: "gray",
};

export const SEVERITY_CONFIG: Record<SuggestionSeverity, {
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
    label: SUGGESTION_SEVERITY_LABELS.high,
  },
  medium: {
    icon: Info,
    containerClass: "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950",
    iconClass: "text-yellow-500",
    badgeColor: "yellow",
    label: SUGGESTION_SEVERITY_LABELS.medium,
  },
  low: {
    icon: Info,
    containerClass: "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950",
    iconClass: "text-blue-500",
    badgeColor: "blue",
    label: SUGGESTION_SEVERITY_LABELS.low,
  },
};
