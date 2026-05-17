export interface LoadoutPopoverProps {
  utilOptions: Array<{ value: string; label: string }>;
  loadout: string[];
  onToggle: (slug: string) => void;
  onClear: () => void;
  onClose: () => void;
}

export default function LoadoutPopover({
  utilOptions,
  loadout,
  onToggle,
  onClear,
  onClose,
}: LoadoutPopoverProps) {
  return (
    <div
      className="absolute top-full left-0 mt-1 z-20 bg-card border rounded-lg shadow-lg p-3 min-w-[200px]"
      role="dialog"
      aria-label="Set your loadout utilities"
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-muted-foreground">My loadout</p>
        <button
          type="button"
          onClick={onClose}
          className="p-0.5 rounded hover:bg-muted/40 text-muted-foreground text-xs"
          aria-label="Close loadout"
        >
          ✕
        </button>
      </div>
      <p className="text-xs text-muted-foreground mb-2">
        Select utilities you have this round to narrow the filter.
      </p>
      <div className="space-y-1">
        {utilOptions.map((opt) => (
          <label
            key={opt.value}
            className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-muted/40 text-sm"
          >
            <input
              type="checkbox"
              checked={loadout.includes(opt.value)}
              onChange={() => onToggle(opt.value)}
              className="h-4 w-4 rounded"
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
      {loadout.length > 0 && (
        <button
          type="button"
          onClick={() => {
            onClear();
            onClose();
          }}
          className="mt-2 w-full text-xs text-muted-foreground hover:text-foreground py-1"
        >
          Clear loadout
        </button>
      )}
    </div>
  );
}
