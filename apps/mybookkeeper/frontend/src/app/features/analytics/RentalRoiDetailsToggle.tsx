import { ChevronDown } from "lucide-react";
import { cn } from "@/shared/utils/cn";

export interface RentalRoiDetailsToggleProps {
  expanded: boolean;
  controls: string;
  propertyName: string;
  onToggle: () => void;
}

export default function RentalRoiDetailsToggle({ expanded, controls, propertyName, onToggle }: RentalRoiDetailsToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={controls}
      aria-label={`Details for ${propertyName}`}
      className="inline-flex min-h-[44px] min-w-[44px] items-center gap-1 text-sm font-medium text-primary hover:underline"
    >
      Details
      <ChevronDown size={14} aria-hidden className={cn("transition-transform", expanded && "rotate-180")} />
    </button>
  );
}
