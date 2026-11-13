import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Drawer } from "vaul";
import { useMediaQuery } from "../../hooks/useMediaQuery";

export interface PanelProps {
  position: "right" | "center";
  width?: string;
  onClose: () => void;
  children: React.ReactNode;
}

export default function Panel({ position, width, onClose, children }: PanelProps) {
  const isMobile = useMediaQuery("(max-width: 768px)");
  // Panels are opened by ordinary buttons, not a Radix Trigger, so Radix has
  // nothing to return focus to on close. Remember what had focus on open.
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );

  function restoreFocus(event: Event) {
    event.preventDefault();
    if (opener?.isConnected) opener.focus();
  }

  if (isMobile && position === "right") {
    return (
      <Drawer.Root open onOpenChange={(o) => !o && onClose()}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/50 z-[60]" />
          <Drawer.Content
            aria-describedby={undefined}
            onCloseAutoFocus={restoreFocus}
            className="fixed bottom-0 left-0 right-0 z-[60] bg-card rounded-t-xl max-h-[90vh] flex flex-col overflow-hidden"
          >
            <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-muted-foreground/30 my-3" />
            <div className="flex-1 min-h-0 flex flex-col overflow-y-auto overscroll-contain">
              {children}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  const isRight = position === "right";

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          data-testid="panel-overlay"
          className={`fixed inset-0 ${isRight ? "bg-black/20 z-40" : "bg-black/60 z-[60]"}`}
        />
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={restoreFocus}
          className={
            isRight
              ? "fixed right-0 top-0 h-screen w-full sm:w-auto bg-background border-l shadow-xl z-50 flex flex-col focus:outline-none"
              : "fixed inset-0 m-auto z-[60] bg-white rounded-lg shadow-2xl flex flex-col focus:outline-none"
          }
          style={
            isRight
              ? { maxWidth: "100vw", width: width ?? "440px" }
              : { maxWidth: "100vw", width: width ?? "90vw", height: "90vh" }
          }
        >
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
