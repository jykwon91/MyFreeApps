import Kbd from "./Kbd";

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function ShortcutsModal({ open, onClose }: ShortcutsModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="bg-card rounded-lg border shadow-lg max-w-md w-full p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold">Keyboard shortcuts</h2>
        <ul className="text-sm space-y-1 grid grid-cols-2 gap-x-4">
          <li>
            <Kbd>1</Kbd>/<Kbd>2</Kbd>/<Kbd>3</Kbd> Section nav
          </li>
          <li>
            <Kbd>Ctrl+S</Kbd> Save section
          </li>
          <li>
            <Kbd>Ctrl+Z</Kbd> Undo
          </li>
          <li>
            <Kbd>Ctrl+⇧+Z</Kbd> Redo
          </li>
          <li>
            <Kbd>R</Kbd> Recapture (Region)
          </li>
          <li>
            <Kbd>N</Kbd> New polygon (Zones)
          </li>
          <li>
            <Kbd>V</Kbd> Add-vertex mode (Zones)
          </li>
          <li>
            <Kbd>P</Kbd> Preview / Pick (context)
          </li>
          <li>
            <Kbd>[</Kbd>/<Kbd>]</Kbd> Tolerance ±1 (Dots)
          </li>
          <li>
            <Kbd>Esc</Kbd> Cancel
          </li>
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="w-full mt-3 px-3 py-1.5 rounded-md border hover:bg-muted/40 text-sm"
        >
          Close
        </button>
      </div>
    </div>
  );
}
