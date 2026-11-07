import { markStyleDef } from "@/games/wow-forever/data/worldMap/mapMarkStyles";
import type { SharedMarks } from "@/games/wow-forever/types/mapMarks/sharedMarks";

interface SharedViewBannerProps {
  /** The link's marks (null = the link carried none — only its layers are on show). */
  shared: SharedMarks | null;
  /** The shared marks' map name. */
  mapName: string;
  /** False when the player has browsed to another map since. */
  onSharedMap: boolean;
  /** The link's layers are on screen but not saved as yours. */
  previewing: boolean;
  onSave: () => void;
  onDismiss: () => void;
  onOpenMap: () => void;
  onKeepLayers: () => void;
  onUseMyLayers: () => void;
}

const BUTTON = "rounded-md border bg-card px-3 text-sm min-h-[44px] sm:min-h-[36px] hover:bg-muted/40";

/**
 * A "Share this view" link, opened: the shared marks shown read-only (dashed
 * on the map) until saved or dismissed — saving ADDS them to yours, never
 * replacing any — and the shared layers until kept or swapped back for yours.
 */
export default function SharedViewBanner(props: SharedViewBannerProps) {
  const { shared, mapName, onSharedMap, previewing } = props;
  return (
    <div role="region" aria-label="Shared with you" data-testid="shared-view-banner" className="space-y-2 rounded-md border border-violet-500 bg-violet-500/10 px-3 py-2 text-sm">
      {shared && (
        <>
          <p className="font-semibold">
            Shared with you: {shared.marks.marks.length} {shared.marks.marks.length === 1 ? "mark" : "marks"} on {mapName}
            {shared.marks.route.length > 1 && ` and a ${shared.marks.route.length}-stop route`}
          </p>
          <p className="text-xs text-muted-foreground">Shown dashed on the map. They aren't yours until you save them.</p>
          <ul className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Shared marks">
            {shared.marks.marks.map((mark) => (
              <li key={mark.id} className="inline-flex items-center gap-1">
                <span aria-hidden>{markStyleDef(mark.style).glyph}</span>
                {mark.label}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={props.onSave} className={`${BUTTON} font-medium`}>
              Save to my marks
            </button>
            {!onSharedMap && (
              <button type="button" onClick={props.onOpenMap} className={BUTTON}>
                Show {mapName}
              </button>
            )}
            <button type="button" onClick={props.onDismiss} className={BUTTON}>
              Dismiss
            </button>
          </div>
        </>
      )}
      {previewing && (
        <div className="flex flex-wrap items-center gap-2">
          <span>The map shows the layers from the link.</span>
          <button type="button" onClick={props.onKeepLayers} className={BUTTON}>
            Keep these layers
          </button>
          <button type="button" onClick={props.onUseMyLayers} className={BUTTON}>
            Use my layers
          </button>
        </div>
      )}
    </div>
  );
}
