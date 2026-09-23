import { formatCoord } from "@/games/wow-forever/worldMap/geometry";

interface PositionConfirmProps {
  zoneName: string;
  x: number;
  y: number;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Clicking a zone you're only browsing asks first — browsing the map must
 * never move your saved position by accident.
 */
export default function PositionConfirm({ zoneName, x, y, onConfirm, onCancel }: PositionConfirmProps) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2 text-sm">
      <span>
        Set your position to {zoneName} ({formatCoord(x)}, {formatCoord(y)})?
      </span>
      <button
        type="button"
        onClick={onConfirm}
        className="rounded-md bg-primary px-3 text-primary-foreground min-h-[44px] sm:min-h-[32px]"
      >
        Set position here
      </button>
      <button type="button" onClick={onCancel} className="rounded-md border px-3 min-h-[44px] sm:min-h-[32px]">
        Cancel
      </button>
    </div>
  );
}
