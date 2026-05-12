import { useState } from "react";
import { showError, showSuccess } from "@platform/ui";
import { useCreateLineupPackageMutation } from "@/store/lineupPackagesApi";
import { useGetLineupsQuery } from "@/store/lineupsApi";

export interface CreatePackageDialogProps {
  gameId: string;
  mapId: string;
  gameSlug: string;
  mapSlug: string;
  side: string;
  onClose: () => void;
}

export default function CreatePackageDialog({
  gameId,
  mapId,
  gameSlug,
  mapSlug,
  side,
  onClose,
}: CreatePackageDialogProps) {
  const [name, setName] = useState("");
  const [selectedLineupIds, setSelectedLineupIds] = useState<string[]>([]);
  const [createPackage, { isLoading }] = useCreateLineupPackageMutation();

  const { data: lineups = [], isLoading: lineupsLoading } = useGetLineupsQuery(
    {
      game_slug: gameSlug,
      map_slug: mapSlug,
      side: side !== "any" ? side : undefined,
    },
    { skip: !gameSlug || !mapSlug },
  );

  const acceptedLineups = lineups.filter((l) => l.status === "accepted");

  function toggleLineup(id: string) {
    setSelectedLineupIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await createPackage({
        name: name.trim(),
        game_id: gameId,
        map_id: mapId,
        side: side as "side_a" | "side_b" | "any",
        lineup_ids: selectedLineupIds,
      }).unwrap();
      showSuccess("Package created.");
      onClose();
    } catch {
      showError("Failed to create package.");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create lineup package"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-card border rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold">Create package</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="pkg-name" className="text-xs font-medium text-muted-foreground">
              Package name
            </label>
            <input
              id="pkg-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Full B exec"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              required
            />
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Select lineups to include ({selectedLineupIds.length} selected)
            </p>
            {lineupsLoading ? (
              <div className="h-32 bg-muted/40 rounded-lg animate-pulse" />
            ) : acceptedLineups.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No accepted lineups for this game/map/side filter.
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1 border rounded-lg p-2">
                {acceptedLineups.map((lineup) => (
                  <label
                    key={lineup.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-muted/40 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedLineupIds.includes(lineup.id)}
                      onChange={() => toggleLineup(lineup.id)}
                      className="h-4 w-4 rounded"
                    />
                    <span className="flex-1 truncate">{lineup.title}</span>
                    {lineup.utility_type && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {lineup.utility_type.name}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-md border hover:bg-muted/40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !name.trim()}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground disabled:opacity-50"
            >
              {isLoading ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
