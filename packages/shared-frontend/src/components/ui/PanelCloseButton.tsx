import { X } from "lucide-react";
import type { PanelCloseButtonProps } from "./PanelCloseButtonProps";

export default function PanelCloseButton({ onClose, label }: PanelCloseButtonProps) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center rounded"
      aria-label={label ?? "Close panel"}
    >
      <X size={18} />
    </button>
  );
}
