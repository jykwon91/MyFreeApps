import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Drawer } from "vaul";
import { useKeyboardClose } from "@/shared/hooks/useKeyboardClose";
import { useMediaQuery } from "@/shared/hooks/useMediaQuery";

export interface PanelProps {
  position: "right" | "center";
  width?: string;
  onClose: () => void;
  children: React.ReactNode;
}

export default function Panel({ position, width, onClose, children }: PanelProps) {
  useKeyboardClose(onClose);
  const isMobile = useMediaQuery("(max-width: 768px)");

  if (isMobile && position === "right") {
    return (
      <Drawer.Root open onOpenChange={(o) => !o && onClose()}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/50 z-[60]" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-[60] bg-card rounded-t-xl max-h-[90vh] flex flex-col overflow-hidden">
            <Drawer.Title className="sr-only">Panel</Drawer.Title>
            <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-muted-foreground/30 my-3" />
            <div className="flex-1 min-h-0 flex flex-col overflow-y-auto overscroll-contain">
              {children}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return createPortal(
    <>
      <div
        className={`fixed inset-0 ${position === "center" ? "bg-black/60 z-[60]" : "bg-black/20 z-40"}`}
        onClick={onClose}
      />

      {position === "right" ? (
        <aside
          className="fixed right-0 top-0 h-screen w-full sm:w-auto bg-background border-l shadow-xl z-50 flex flex-col"
          style={{ maxWidth: "100vw", ...(width ? { width } : { width: "440px" }) }}
        >
          {children}
        </aside>
      ) : (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none"
        >
          <div
            className="relative bg-white rounded-lg shadow-2xl flex flex-col pointer-events-auto"
            style={{ width: width ?? "90vw", height: "90vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}

export function PanelCloseButton({ onClose, label }: { onClose: () => void; label?: string }) {
  return (
    <button
      onClick={onClose}
      className="text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center rounded"
      aria-label={label ?? "Close panel"}
    >
      <X size={18} />
    </button>
  );
}
