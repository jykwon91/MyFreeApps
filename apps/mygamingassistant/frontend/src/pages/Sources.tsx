import { useState, useEffect, useRef, useCallback } from "react";
import { PlaySquare, Trash2, RefreshCw, Pencil, Sparkles } from "lucide-react";
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
  useUpdateSourceMutation,
  useReclassifySourceMutation,
} from "@/store/sourcesApi";
import {
  MapScopePicker,
  type MapScopeValue,
} from "@/components/sources/MapScopePicker";
import type { Source, SourceKind } from "@/types/game";

// ---------------------------------------------------------------------------
// Sync-status tracking
//
// POST /sources/{id}/sync enqueues a fire-and-forget backend BackgroundTask
// and returns immediately — there is no job-status endpoint. The only honest
// completion signal is the source's own freshness: when ingestion finishes
// the backend advances `last_synced_at` and writes `last_sync_stats`. So the
// page captures `last_synced_at` at kick time and polls GET /sources until it
// changes (or a cap elapses), then surfaces the result.
// ---------------------------------------------------------------------------

const SYNC_POLL_MS = 5000;
const SYNC_TIMEOUT_MS = 5 * 60 * 1000;

interface SyncStats {
  video_count?: number;
  chapter_count?: number;
  error_count?: number;
}

interface SyncWatch {
  /** `last_synced_at` at the moment sync was kicked; completion = it changed. */
  baseline: string | null;
  /** Epoch ms after which we stop watching and tell the user to check back. */
  deadline: number;
}

function readSyncStats(configJson: Record<string, unknown>): SyncStats {
  return (configJson["last_sync_stats"] as SyncStats | undefined) ?? {};
}

function formatSyncResult(s: SyncStats): string {
  const base = `${s.video_count ?? 0} videos, ${s.chapter_count ?? 0} lineups`;
  return (s.error_count ?? 0) > 0 ? `${base}, ${s.error_count} errors` : base;
}

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

const NO_SCOPE: MapScopeValue = { game_hint: null, map_hint: null };

/** Human label for a source's classification scope (shown as a row badge). */
function scopeLabel(source: Source): string {
  if (source.map_hint) return source.map_hint;
  if (source.game_hint) return `${source.game_hint} (all maps)`;
  return "No scope";
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
  const [scope, setScope] = useState<MapScopeValue>(NO_SCOPE);
  const [createSource, { isLoading }] = useCreateSourceMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    try {
      await createSource({
        kind,
        url: url.trim(),
        game_hint: scope.game_hint,
        map_hint: scope.map_hint,
      }).unwrap();
      showSuccess("Source added — it will sync shortly.");
      setUrl("");
      setScope(NO_SCOPE);
      onAdded();
    } catch (err: unknown) {
      showError(extractErrorMessage(err));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3 items-end">
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
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">
          Classification scope (optional)
        </p>
        <MapScopePicker
          value={scope}
          onChange={setScope}
          disabled={isLoading}
          idPrefix="add-source-scope"
        />
        <p className="text-xs text-muted-foreground">
          Lock this source to a map so its lineups can't be mis-classified onto
          another map. You can change this later.
        </p>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// SourceRow
// ---------------------------------------------------------------------------

interface SourceRowProps {
  source: Source;
  /** True while a kicked sync is being watched for completion (page-owned). */
  isSyncing: boolean;
  onSync: () => void;
}

function SourceRow({ source, isSyncing, onSync }: SourceRowProps) {
  const [deleteSource, { isLoading: isDeleting }] = useDeleteSourceMutation();
  const [updateSource, { isLoading: isSavingScope }] = useUpdateSourceMutation();
  const [reclassifySource, { isLoading: isReclassifying }] =
    useReclassifySourceMutation();

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [reclassifyConfirmOpen, setReclassifyConfirmOpen] = useState(false);
  const [editingScope, setEditingScope] = useState(false);
  const [scopeDraft, setScopeDraft] = useState<MapScopeValue>(NO_SCOPE);

  const url = extractUrl(source.config_json);
  const syncStats = source.config_json["last_sync_stats"] as
    | SyncStats
    | undefined;
  const scoped = Boolean(source.map_hint || source.game_hint);
  const busy = isSyncing || isDeleting || isSavingScope || isReclassifying;

  const handleDelete = async () => {
    try {
      await deleteSource(source.id).unwrap();
      showSuccess("Source removed.");
      setDeleteConfirmOpen(false);
    } catch {
      showError("Failed to remove source.");
    }
  };

  const openScopeEditor = () => {
    setScopeDraft({ game_hint: source.game_hint, map_hint: source.map_hint });
    setEditingScope(true);
  };

  const handleSaveScope = async () => {
    try {
      await updateSource({ id: source.id, body: scopeDraft }).unwrap();
      showSuccess("Classification scope updated.");
      setEditingScope(false);
    } catch (err: unknown) {
      showError(extractErrorMessage(err));
    }
  };

  const handleReclassify = async () => {
    try {
      const result = await reclassifySource(source.id).unwrap();
      setReclassifyConfirmOpen(false);
      if (result.total === 0) {
        showSuccess("No pending lineups to reclassify for this source.");
        return;
      }
      const unprocessed = result.total - result.reclassified - result.failed;
      const remainder =
        unprocessed > 0 ? ` (${unprocessed} still pending — run again)` : "";
      const failedNote = result.failed > 0 ? `, ${result.failed} failed` : "";
      showSuccess(
        `Reclassified ${result.reclassified} of ${result.total} pending ` +
          `lineup${result.total === 1 ? "" : "s"}${failedNote}${remainder}.`,
      );
    } catch (err: unknown) {
      setReclassifyConfirmOpen(false);
      showError(extractErrorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Icon + info */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <PlaySquare className="w-5 h-5 mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium rounded-full bg-muted px-2 py-0.5">
                {kindLabel(source.kind)}
              </span>
              <span
                className={`text-xs font-medium rounded-full px-2 py-0.5 ${
                  scoped
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
                title="Classification scope — pending lineups from this source are locked to this map/game"
              >
                {scopeLabel(source)}
              </span>
              <span className="text-sm text-muted-foreground truncate" title={url}>
                {truncateUrl(url)}
              </span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground space-x-3">
              <span>Last sync: {formatDate(source.last_synced_at)}</span>
              {isSyncing && (
                <span className="text-primary">
                  Syncing… (runs in the background)
                </span>
              )}
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
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            onClick={openScopeEditor}
            disabled={busy || editingScope}
            aria-label="Edit classification scope"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 h-8 text-xs font-medium disabled:opacity-50"
          >
            <Pencil className="w-3.5 h-3.5" aria-hidden />
            Scope
          </button>
          <button
            onClick={() => setReclassifyConfirmOpen(true)}
            disabled={busy}
            aria-label="Reclassify pending lineups"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 h-8 text-xs font-medium disabled:opacity-50"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isReclassifying ? "animate-pulse" : ""}`} aria-hidden />
            {isReclassifying ? "Reclassifying…" : "Reclassify pending"}
          </button>
          <button
            onClick={onSync}
            disabled={busy}
            aria-label="Sync now"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 h-8 text-xs font-medium disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} aria-hidden />
            {isSyncing ? "Syncing…" : "Sync now"}
          </button>
          <button
            onClick={() => setDeleteConfirmOpen(true)}
            disabled={busy}
            aria-label="Delete source"
            className="inline-flex items-center rounded-md border border-destructive/30 px-3 h-8 text-xs font-medium text-destructive disabled:opacity-50 hover:bg-destructive/10"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden />
            <span className="sr-only">Delete</span>
          </button>
        </div>
      </div>

      {/* Inline scope editor */}
      {editingScope && (
        <div className="rounded-md border bg-muted/30 p-3 space-y-3">
          <MapScopePicker
            value={scopeDraft}
            onChange={setScopeDraft}
            disabled={isSavingScope}
            idPrefix={`scope-${source.id}`}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleSaveScope}
              disabled={isSavingScope}
              className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {isSavingScope ? "Saving…" : "Save scope"}
            </button>
            <button
              onClick={() => setEditingScope(false)}
              disabled={isSavingScope}
              className="h-8 rounded-md border px-3 text-xs font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <p className="text-xs text-muted-foreground">
              After changing the map, use “Reclassify pending” to re-run the
              classifier on this source's review queue.
            </p>
          </div>
        </div>
      )}

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

      <ConfirmDialog
        open={reclassifyConfirmOpen}
        title="Reclassify pending lineups?"
        description={
          source.map_hint
            ? `Re-runs the AI classifier on this source's pending-review lineups, hard-locked to “${source.map_hint}”. Useful right after setting the map scope.`
            : "Re-runs the AI classifier on this source's pending-review lineups. Tip: set a map scope first so the classifier is hard-locked to the right map."
        }
        confirmLabel="Reclassify"
        isLoading={isReclassifying}
        onConfirm={handleReclassify}
        onCancel={() => setReclassifyConfirmOpen(false)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sources page
// ---------------------------------------------------------------------------

export default function Sources() {
  const [syncing, setSyncing] = useState<Record<string, SyncWatch>>({});
  const anySyncing = Object.keys(syncing).length > 0;

  const { data: sources, isLoading, isError, refetch } = useGetSourcesQuery();
  const [syncSource] = useSyncSourceMutation();

  // Mirror `syncing` into a ref so the poll-tick callback reads the latest
  // watch set without re-subscribing the interval. Updated in an effect
  // (never during render).
  const syncingRef = useRef(syncing);
  useEffect(() => {
    syncingRef.current = syncing;
  }, [syncing]);

  const handleSync = useCallback(
    async (src: Source) => {
      try {
        await syncSource(src.id).unwrap();
        setSyncing((prev) => ({
          ...prev,
          [src.id]: {
            baseline: src.last_synced_at,
            deadline: Date.now() + SYNC_TIMEOUT_MS,
          },
        }));
        showSuccess(
          "Sync started — running in the background. You'll be notified here when it finishes.",
        );
      } catch {
        showError("Could not start sync. Please try again.");
      }
    },
    [syncSource],
  );

  // While any sync is tracked, poll the sources list. A watched source's
  // `last_synced_at` advancing past its baseline means the background
  // ingestion finished; past the deadline we stop watching so this never
  // polls forever. setState happens in the timer callback (not the effect
  // body), and refs are read in the callback (not during render).
  useEffect(() => {
    if (!anySyncing) return;
    let cancelled = false;

    const tick = async () => {
      let srcs: Source[];
      try {
        srcs = await refetch().unwrap();
      } catch {
        return;
      }
      if (cancelled) return;

      const watches = syncingRef.current;
      const now = Date.now();
      const settled: Array<{ id: string; ok: boolean; msg: string }> = [];
      for (const id of Object.keys(watches)) {
        const watch = watches[id];
        const src = srcs.find((s) => s.id === id);
        if (src && src.last_synced_at !== watch.baseline) {
          settled.push({
            id,
            ok: true,
            msg: `Sync complete — ${formatSyncResult(readSyncStats(src.config_json))}.`,
          });
        } else if (now > watch.deadline) {
          settled.push({
            id,
            ok: false,
            msg: "Sync is still running in the background — refresh later to see results.",
          });
        }
      }
      if (settled.length === 0) return;
      for (const s of settled) (s.ok ? showSuccess : showError)(s.msg);
      setSyncing((prev) => {
        const next = { ...prev };
        for (const s of settled) delete next[s.id];
        return next;
      });
    };

    const handle = setInterval(tick, SYNC_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [anySyncing, refetch]);

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
              <SourceRow
                key={source.id}
                source={source}
                isSyncing={Boolean(syncing[source.id])}
                onSync={() => handleSync(source)}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
