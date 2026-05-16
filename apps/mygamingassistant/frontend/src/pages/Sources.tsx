import { useState } from "react";
import { PlaySquare, Trash2, RefreshCw } from "lucide-react";
import {
  showError,
  showSuccess,
  extractErrorMessage,
  ConfirmDialog,
} from "@platform/ui";
import {
  useGetSourcesQuery,
  useCreateSourceMutation,
  useDeleteSourceMutation,
  useSyncSourceMutation,
} from "@/store/sourcesApi";
import type { SourceKind } from "@/types/game";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function extractUrl(configJson: Record<string, unknown>): string {
  const url = configJson["url"] ?? configJson["channel_url"];
  return typeof url === "string" ? url : "";
}

function truncateUrl(url: string, max = 60): string {
  return url.length > max ? `${url.slice(0, max)}…` : url;
}

function kindLabel(kind: SourceKind): string {
  return kind === "youtube_playlist" ? "Playlist" : "Channel";
}

// ---------------------------------------------------------------------------
// AddSourceForm
// ---------------------------------------------------------------------------

interface AddSourceFormProps {
  onAdded: () => void;
}

function AddSourceForm({ onAdded }: AddSourceFormProps) {
  const [kind, setKind] = useState<SourceKind>("youtube_playlist");
  const [url, setUrl] = useState("");
  const [createSource, { isLoading }] = useCreateSourceMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    try {
      await createSource({ kind, url: url.trim() }).unwrap();
      showSuccess("Source added — it will sync shortly.");
      setUrl("");
      onAdded();
    } catch (err: unknown) {
      showError(extractErrorMessage(err));
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col sm:flex-row gap-3 items-end"
    >
      <div className="flex flex-col gap-1 shrink-0">
        <label htmlFor="source-kind" className="text-xs font-medium text-muted-foreground">
          Type
        </label>
        <select
          id="source-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as SourceKind)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="youtube_playlist">Playlist</option>
          <option value="youtube_channel">Channel</option>
        </select>
      </div>

      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <label htmlFor="source-url" className="text-xs font-medium text-muted-foreground">
          URL
        </label>
        <input
          id="source-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={
            kind === "youtube_playlist"
              ? "https://www.youtube.com/playlist?list=..."
              : "https://www.youtube.com/@handle"
          }
          className="h-9 rounded-md border border-input bg-background px-3 text-sm w-full"
          required
        />
      </div>

      <button
        type="submit"
        disabled={isLoading || !url.trim()}
        className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50 shrink-0"
      >
        {isLoading ? "Adding…" : "Add source"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// SourceRow
// ---------------------------------------------------------------------------

interface SourceRowProps {
  source: {
    id: string;
    kind: SourceKind;
    config_json: Record<string, unknown>;
    last_synced_at: string | null;
    created_at: string;
  };
}

function SourceRow({ source }: SourceRowProps) {
  const [syncSource, { isLoading: isSyncing }] = useSyncSourceMutation();
  const [deleteSource, { isLoading: isDeleting }] = useDeleteSourceMutation();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const url = extractUrl(source.config_json);
  const syncStats = source.config_json["last_sync_stats"] as
    | { video_count?: number; chapter_count?: number; error_count?: number }
    | undefined;

  const handleSync = async () => {
    try {
      await syncSource(source.id).unwrap();
      showSuccess("Sync started — lineups will appear in pending review when complete.");
    } catch {
      showError("Could not start sync. Please try again.");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteSource(source.id).unwrap();
      showSuccess("Source removed.");
      setDeleteConfirmOpen(false);
    } catch {
      showError("Failed to remove source.");
    }
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border p-4">
      {/* Icon + info */}
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <PlaySquare className="w-5 h-5 mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium rounded-full bg-muted px-2 py-0.5">
              {kindLabel(source.kind)}
            </span>
            <span className="text-sm text-muted-foreground truncate" title={url}>
              {truncateUrl(url)}
            </span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground space-x-3">
            <span>Last sync: {formatDate(source.last_synced_at)}</span>
            {syncStats && (
              <>
                <span>{syncStats.video_count ?? 0} videos</span>
                <span>{syncStats.chapter_count ?? 0} lineups</span>
                {(syncStats.error_count ?? 0) > 0 && (
                  <span className="text-destructive">{syncStats.error_count} errors</span>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleSync}
          disabled={isSyncing}
          aria-label="Sync now"
          className="inline-flex items-center gap-1.5 rounded-md border px-3 h-8 text-xs font-medium disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} aria-hidden />
          {isSyncing ? "Syncing…" : "Sync now"}
        </button>
        <button
          onClick={() => setDeleteConfirmOpen(true)}
          disabled={isDeleting}
          aria-label="Delete source"
          className="inline-flex items-center rounded-md border border-destructive/30 px-3 h-8 text-xs font-medium text-destructive disabled:opacity-50 hover:bg-destructive/10"
        >
          <Trash2 className="w-3.5 h-3.5" aria-hidden />
          <span className="sr-only">Delete</span>
        </button>
      </div>

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Remove this source?"
        description="Existing lineups from it will be kept."
        confirmLabel="Remove"
        variant="destructive"
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sources page
// ---------------------------------------------------------------------------

export default function Sources() {
  const { data: sources, isLoading, isError, refetch } = useGetSourcesQuery();

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">YouTube Sources</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Add YouTube playlists or channels to automatically ingest lineups.
          Videos with chapter timestamps are parsed; each chapter becomes a
          pending lineup for review.
        </p>
      </div>

      {/* Add source form */}
      <section aria-label="Add source">
        <AddSourceForm onAdded={refetch} />
      </section>

      {/* Source list */}
      <section aria-label="Sources">
        {isLoading && (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-20 rounded-lg bg-muted/40 animate-pulse" aria-hidden />
            ))}
          </div>
        )}

        {isError && (
          <p className="text-sm text-destructive">Failed to load sources. Please refresh.</p>
        )}

        {!isLoading && !isError && sources && sources.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No sources yet. Add a YouTube playlist or channel above to get started.
          </p>
        )}

        {!isLoading && !isError && sources && sources.length > 0 && (
          <div className="space-y-3">
            {sources.map((source) => (
              <SourceRow key={source.id} source={source} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
