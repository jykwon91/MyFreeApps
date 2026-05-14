/**
 * ZonePropertiesPanel — right rail in the Zones editor.
 *
 * Shows:
 *   - Slug + name editors
 *   - Vertex count (read-only)
 *   - Delete-zone button (ConfirmDialog)
 *   - "Add vertex" / "Delete vertex" mode toggles
 *
 * The fill color is auto-assigned from the zone's slug (deterministic hash)
 * so the operator doesn't have to pick a palette entry — color is just an
 * affordance for distinguishing polygons in the editor, not stored as part
 * of the calibration JSON.
 */
import { useState } from "react";
import { Button, ConfirmDialog } from "@platform/ui";
import { Trash2 } from "lucide-react";
import ZoneSlugCombobox from "./ZoneSlugCombobox";
import type { CvZonePolygon } from "@/types/desktop";
import type { EditorMode } from "./ZoneEditorCanvas";

interface ZonePropertiesPanelProps {
  zone: CvZonePolygon | null;
  availableSlugs: string[];
  mode: EditorMode;
  onUpdateSlug: (oldSlug: string, newSlug: string) => void;
  onUpdateName: (slug: string, name: string) => void;
  onDeleteZone: (slug: string) => void;
  onSetMode: (mode: EditorMode) => void;
  onStartNewPolygon: () => void;
}

export default function ZonePropertiesPanel({
  zone,
  availableSlugs,
  mode,
  onUpdateSlug,
  onUpdateName,
  onDeleteZone,
  onSetMode,
  onStartNewPolygon,
}: ZonePropertiesPanelProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!zone) {
    return (
      <aside className="border rounded-md bg-card p-4 text-sm text-muted-foreground space-y-3">
        <p>Select a zone from the list to edit it.</p>
        <Button size="sm" onClick={onStartNewPolygon}>
          + New polygon
        </Button>
      </aside>
    );
  }

  const isUnregistered = !availableSlugs.includes(zone.slug);
  const slugInputId = `zone-properties-slug-${zone.slug}`;

  return (
    <aside
      className="border rounded-md bg-card p-3 space-y-3"
      aria-label="Zone properties"
    >
      <header className="text-xs font-medium text-muted-foreground uppercase">
        Selected zone
      </header>

      <ZoneSlugCombobox
        id={slugInputId}
        value={zone.slug}
        availableSlugs={availableSlugs}
        isUnregistered={isUnregistered}
        onChange={(next) => onUpdateSlug(zone.slug, next)}
      />

      <div className="space-y-1">
        <label
          htmlFor={`zone-properties-name-${zone.slug}`}
          className="text-xs text-muted-foreground"
        >
          Display name
        </label>
        <input
          id={`zone-properties-name-${zone.slug}`}
          type="text"
          value={zone.name}
          onChange={(e) => onUpdateName(zone.slug, e.target.value)}
          className="w-full px-2 py-1 rounded-md border bg-background text-sm min-h-[36px]"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Vertices: <span className="font-mono">{zone.points.length}</span>
      </p>

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Edit mode</p>
        <div className="flex flex-wrap gap-1">
          <ModeChip
            label="Select"
            active={mode === "select"}
            onClick={() => onSetMode("select")}
          />
          <ModeChip
            label="Add vertex"
            active={mode === "add-vertex"}
            onClick={() => onSetMode("add-vertex")}
          />
          <ModeChip
            label="New polygon"
            active={mode === "new"}
            onClick={() => onStartNewPolygon()}
          />
        </div>
      </div>

      <Button
        size="sm"
        variant="destructive"
        onClick={() => setConfirmDelete(true)}
      >
        <Trash2 className="w-4 h-4 mr-1" aria-hidden />
        Delete zone
      </Button>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete polygon?"
        description={`This removes "${zone.name}" (${zone.slug}) from the draft. You can still discard the edit before saving.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          onDeleteZone(zone.slug);
          setConfirmDelete(false);
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </aside>
  );
}

interface ModeChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function ModeChip({ label, active, onClick }: ModeChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "px-2 py-1 rounded-md text-xs min-h-[32px] transition-colors " +
        (active
          ? "bg-primary text-primary-foreground"
          : "bg-muted/40 hover:bg-muted/60")
      }
    >
      {label}
    </button>
  );
}
