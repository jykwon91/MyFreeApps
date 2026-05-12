import { useState } from "react";
import { Package, Pin, Pencil, Trash2 } from "lucide-react";
import { showError, showSuccess } from "@platform/ui";
import {
  usePatchLineupPackageMutation,
  useDeleteLineupPackageMutation,
  usePinAllLineupPackageMutation,
} from "@/store/lineupPackagesApi";
import { usePins } from "@/hooks/usePins";
import type { Game, LineupPackage } from "@/types/game";

function sideLabel(side: string, game?: Game): string {
  if (side === "any") return "Any side";
  if (side === "side_a") return game?.side_a_label ?? "Side A";
  if (side === "side_b") return game?.side_b_label ?? "Side B";
  return side;
}

export interface PackageRowProps {
  pkg: LineupPackage;
  game?: Game;
  gameSlug: string;
  mapSlug: string;
}

export default function PackageRow({ pkg, game, gameSlug, mapSlug }: PackageRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(pkg.name);
  const [patchPackage, { isLoading: isPatching }] = usePatchLineupPackageMutation();
  const [deletePackage, { isLoading: isDeleting }] = useDeleteLineupPackageMutation();
  const [pinAll, { isLoading: isPinning }] = usePinAllLineupPackageMutation();

  const pins = usePins(gameSlug, mapSlug, pkg.side);

  async function handlePinAll() {
    try {
      const result = await pinAll(pkg.id).unwrap();
      for (const id of result.lineup_ids) {
        pins.pin(id);
      }
      showSuccess(
        `Pinned ${result.lineup_ids.length} lineup${result.lineup_ids.length !== 1 ? "s" : ""}.`,
      );
    } catch {
      showError("Failed to pin lineups.");
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editName.trim()) return;
    try {
      await patchPackage({ id: pkg.id, patch: { name: editName.trim() } }).unwrap();
      showSuccess("Package renamed.");
      setIsEditing(false);
    } catch {
      showError("Failed to rename package.");
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        `Delete package "${pkg.name}"? This won't remove the lineups themselves.`,
      )
    ) {
      return;
    }
    try {
      await deletePackage(pkg.id).unwrap();
      showSuccess("Package deleted.");
    } catch {
      showError("Failed to delete package.");
    }
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border p-4">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <Package className="w-5 h-5 mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <form onSubmit={handleSaveEdit} className="flex items-center gap-2">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                autoFocus
              />
              <button
                type="submit"
                disabled={isPatching || !editName.trim()}
                className="h-8 px-3 text-xs rounded-md bg-primary text-primary-foreground disabled:opacity-50"
              >
                {isPatching ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setEditName(pkg.name);
                }}
                className="h-8 px-3 text-xs rounded-md border hover:bg-muted/40"
              >
                Cancel
              </button>
            </form>
          ) : (
            <p className="text-sm font-medium truncate">{pkg.name}</p>
          )}
          <div className="mt-1 text-xs text-muted-foreground space-x-3">
            <span>{sideLabel(pkg.side, game)}</span>
            <span>
              {pkg.lineup_ids.length} lineup{pkg.lineup_ids.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handlePinAll}
          disabled={isPinning || pkg.lineup_ids.length === 0}
          title="Pin all lineups in this package"
          className="inline-flex items-center gap-1.5 rounded-md border px-3 h-8 text-xs font-medium disabled:opacity-50 hover:bg-muted/40"
        >
          <Pin className="w-3.5 h-3.5" aria-hidden />
          Pin all
        </button>
        <button
          onClick={() => setIsEditing(true)}
          disabled={isEditing}
          title="Rename package"
          className="inline-flex items-center rounded-md border px-3 h-8 text-xs font-medium hover:bg-muted/40 disabled:opacity-50"
          aria-label="Edit package name"
        >
          <Pencil className="w-3.5 h-3.5" aria-hidden />
          <span className="sr-only">Edit</span>
        </button>
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          title="Delete package"
          className="inline-flex items-center rounded-md border border-destructive/30 px-3 h-8 text-xs font-medium text-destructive disabled:opacity-50 hover:bg-destructive/10"
          aria-label="Delete package"
        >
          <Trash2 className="w-3.5 h-3.5" aria-hidden />
          <span className="sr-only">Delete</span>
        </button>
      </div>
    </div>
  );
}
