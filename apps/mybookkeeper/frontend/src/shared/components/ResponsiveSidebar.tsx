import { useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { useMediaQuery } from "@/shared/hooks/useMediaQuery";
import { NARROW_LAYOUT_QUERY } from "@/shared/lib/layout-breakpoints";

interface ResponsiveSidebarProps {
  title: string;
  /** Shown under the title, inside the sidebar's top section. */
  header: ReactNode;
  /** The rest of the sidebar. Call `closeDrawer` when a link is followed. */
  children: (closeDrawer: () => void) => ReactNode;
}

const SIDEBAR_CLASSES = "w-56 bg-card border-r flex flex-col";
// Keyframes live in index.css.
const DRAWER_MOTION_CLASSES =
  "data-[state=open]:animate-[sidebar-slide-in_200ms_ease-out] data-[state=closed]:animate-[sidebar-slide-out_200ms_ease-in] motion-reduce:animate-none";

/**
 * The layout sidebar: an always-visible column on wide screens, and on narrow
 * screens a modal slide-in menu opened from a top-bar button. Closed, the menu
 * is not in the page at all, so keyboard and screen-reader users never land on
 * links they cannot see. Open, it takes focus, closes on Escape or a tap
 * outside, and hands focus back to the menu button.
 */
export default function ResponsiveSidebar({ title, header, children }: ResponsiveSidebarProps) {
  const isNarrow = useMediaQuery(NARROW_LAYOUT_QUERY);
  const [open, setOpen] = useState(false);
  // Widening the window while the menu is open drops the drawer; don't let it
  // spring back open the next time the window narrows.
  if (!isNarrow && open) setOpen(false);

  const closeDrawer = () => setOpen(false);

  if (!isNarrow) {
    return (
      <aside className={`${SIDEBAR_CLASSES} h-screen shrink-0`}>
        <div className="px-4 py-4 border-b">
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold text-lg">{title}</span>
          </div>
          {header}
        </div>
        {children(closeDrawer)}
      </aside>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <header className="fixed top-0 left-0 right-0 h-14 bg-card border-b z-30 flex items-center px-4">
        <Dialog.Trigger
          className="min-w-[44px] min-h-[44px] flex items-center justify-center -ml-2"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </Dialog.Trigger>
        <span className="font-semibold text-sm ml-3">{title}</span>
      </header>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Content asChild aria-describedby={undefined}>
          <aside className={`${SIDEBAR_CLASSES} ${DRAWER_MOTION_CLASSES} fixed top-0 left-0 h-dvh z-50 outline-none`}>
            <div className="px-4 py-4 border-b">
              <div className="flex items-center justify-between mb-3">
                <Dialog.Title className="font-semibold text-lg">{title}</Dialog.Title>
                <Dialog.Close className="p-1" aria-label="Close menu">
                  <X size={18} />
                </Dialog.Close>
              </div>
              {header}
            </div>
            {children(closeDrawer)}
          </aside>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
