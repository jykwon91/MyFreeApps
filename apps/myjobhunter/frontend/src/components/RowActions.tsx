import type { RowActionsProps } from "@/types/row-actions/row-actions-props";

// Buttons are visible by default. Only on devices that can hover are they
// hidden until the row is hovered, and keyboard focus anywhere in the row (or
// on a button) reveals them again, so touch and keyboard users always see them.
// The row (or an ancestor) must carry the `group` class.
const REVEAL_ON_HOVER_CLASSES =
  "hover-capable:opacity-0 hover-capable:group-hover:opacity-100 hover-capable:group-focus-within:opacity-100 hover-capable:focus-within:opacity-100";

const BUTTON_BASE_CLASSES =
  "p-2 rounded min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors disabled:opacity-50";

export default function RowActions({ actions }: RowActionsProps) {
  return (
    <div className={`flex gap-1 transition-opacity ${REVEAL_ON_HOVER_CLASSES}`}>
      {actions.map(({ key, label, icon: Icon, onClick, destructive, disabled }) => (
        <button
          key={key}
          type="button"
          onClick={onClick}
          disabled={disabled}
          className={`${BUTTON_BASE_CLASSES} ${destructive ? "hover:bg-destructive/10 text-destructive" : "hover:bg-muted"}`}
          aria-label={label}
          title={label}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  );
}
