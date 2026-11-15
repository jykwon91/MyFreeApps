import { Maximize2, Minimize2 } from "lucide-react";

interface MapFullSizeButtonProps {
  fullSize: boolean;
  onToggle: () => void;
}

/** In the breadcrumb row over the map (never on the picture, where it would block clicks): fill the window with the map, and back. */
export default function MapFullSizeButton({ fullSize, onToggle }: MapFullSizeButtonProps) {
  const label = fullSize ? "Exit full size" : "Full size map";
  const Icon = fullSize ? Minimize2 : Maximize2;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={fullSize ? "Exit full size (Esc)" : "Fill the window with the map"}
      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-md border bg-card px-3 text-sm font-medium hover:bg-muted sm:min-h-[32px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
    >
      <Icon aria-hidden className="h-4 w-4" />
      <span aria-hidden className="hidden sm:inline">
        {label}
      </span>
    </button>
  );
}
