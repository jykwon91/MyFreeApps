/**
 * KeyboardShortcutsHelp — overlay panel listing keyboard bindings.
 *
 * Shown when the user presses "?"; dismissed by pressing "?" again,
 * pressing Escape, or clicking outside.
 */
import { useEffect } from "react";

interface ShortcutRow {
  key: string;
  description: string;
}

const SHORTCUTS: ShortcutRow[] = [
  { key: "1 / 2 / 3", description: "Switch side (Side A / Side B / Any)" },
  { key: "q / w / e / r", description: "Toggle utility chips (first 4 in order)" },
  { key: "p", description: "Toggle round mode" },
  { key: "c", description: "Toggle compact mode" },
  { key: "f", description: "Toggle fullscreen" },
  { key: "← →", description: "Cycle cards (when panel open or in round mode)" },
  { key: "Esc", description: "Close panel → exit round mode" },
  { key: "?", description: "Show / hide this help" },
];

interface KeyboardShortcutsHelpProps {
  onClose: () => void;
}

export default function KeyboardShortcutsHelp({ onClose }: KeyboardShortcutsHelpProps) {
  // Close on Escape (keyboard hook handles "?" toggle; this handles raw Esc)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-label="Keyboard shortcuts"
    >
      {/* Panel — stop click propagation so clicking inside doesn't close */}
      <div
        className="bg-card border rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">Keyboard shortcuts</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-muted/40 text-muted-foreground text-xs"
            aria-label="Close shortcuts help"
          >
            ✕
          </button>
        </div>

        <table className="w-full text-sm" aria-label="Keyboard shortcut list">
          <tbody>
            {SHORTCUTS.map(({ key, description }) => (
              <tr key={key} className="border-t first:border-t-0">
                <td className="py-1.5 pr-4 font-mono text-xs text-muted-foreground whitespace-nowrap">
                  {key}
                </td>
                <td className="py-1.5 text-foreground">{description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
