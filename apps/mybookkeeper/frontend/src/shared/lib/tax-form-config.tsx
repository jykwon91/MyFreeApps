import { CheckCircle2, AlertTriangle, AlertCircle, Minus } from "lucide-react";
import type { BadgeColor } from "@/shared/components/ui/Badge";
import type { ValidationStatus, SourceType } from "@/shared/types/tax/tax-form";

export const VALIDATION_ICONS: Record<ValidationStatus, React.ReactNode> = {
  valid: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  warning: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
  error: <AlertCircle className="h-4 w-4 text-red-500" />,
  unvalidated: <Minus className="h-4 w-4 text-gray-400" />,
};

export const SOURCE_BADGES: Record<SourceType, { label: string; color: BadgeColor }> = {
  extracted: { label: "Extracted", color: "blue" },
  computed: { label: "Computed", color: "gray" },
  manual: { label: "Manual", color: "orange" },
};

export const PII_FIELDS = new Set([
  "recipient_tin", "payer_tin", "ssn", "account_number", "recipient_ssn",
]);

export const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;
