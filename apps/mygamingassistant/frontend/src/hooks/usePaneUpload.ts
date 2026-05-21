/**
 * usePaneUpload — three-step per-pane Replace flow (PR1).
 *
 *   1. Operator picks a file → request a presigned PUT URL from the backend
 *   2. PUT the bytes to MinIO directly via XHR (with upload progress)
 *   3. Confirm to the backend — it writes the new key onto the right column
 *      and RTK Query invalidation re-fetches the lineup so the tile re-renders
 *
 * State machine:
 *   { phase: "idle" }
 *   { phase: "uploading", progress: 0..1 }
 *   { phase: "error", message }
 *
 * No explicit "success" phase — RTK Query cache invalidation re-renders the
 * pane with the new asset, which IS the success confirmation. After the
 * confirm mutation settles we transition the local state back to idle.
 */
import { useCallback, useRef, useState } from "react";
import {
  useConfirmPaneUploadMutation,
  useRequestPaneUploadUrlMutation,
} from "@/store/lineupsApi";

export type PanePosition = "stand" | "aim" | "throw" | "landing";
export type PaneKind = "still" | "clip";

export type PaneUploadPhase =
  | { phase: "idle" }
  | { phase: "uploading"; progress: number }
  | { phase: "error"; message: string };

interface UploadArgs {
  lineupId: string;
  pane: PanePosition;
  file: File;
}

// 30 seconds is generous for a few-MB clip on a typical connection; an
// upload still progressing past that is almost always a stall worth
// surfacing as a clear error rather than a silent hang.
const UPLOAD_TIMEOUT_MS = 30_000;

function inferKindFromMime(mime: string): PaneKind | null {
  if (mime.startsWith("image/")) return "still";
  if (mime.startsWith("video/")) return "clip";
  return null;
}

export function usePaneUpload() {
  const [phase, setPhase] = useState<PaneUploadPhase>({ phase: "idle" });
  // Live XHR reference so the overlay's retry path can abort an in-flight
  // upload before re-trying — without this the second attempt races the
  // first and the slower one's confirm clobbers the faster one's.
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const [requestUrl] = useRequestPaneUploadUrlMutation();
  const [confirmUpload] = useConfirmPaneUploadMutation();

  const upload = useCallback(
    async ({ lineupId, pane, file }: UploadArgs) => {
      const kind = inferKindFromMime(file.type);
      if (kind === null) {
        setPhase({
          phase: "error",
          message: `Unsupported file type '${file.type}'`,
        });
        return;
      }

      // Validate pane / kind combination on the client so we fail fast and
      // can show a useful inline message before hitting the network. The
      // server re-checks the same constraint (defense in depth).
      if ((pane === "throw" || pane === "landing") && kind === "still") {
        setPhase({
          phase: "error",
          message: `${pane.toUpperCase()} pane only accepts video files`,
        });
        return;
      }

      setPhase({ phase: "uploading", progress: 0 });

      let urlResp: { upload_url: string; object_key: string };
      try {
        urlResp = await requestUrl({
          lineup_id: lineupId,
          pane,
          kind,
          content_type: file.type,
          content_length: file.size,
        }).unwrap();
      } catch (err) {
        setPhase({
          phase: "error",
          message: extractError(err) ?? "Could not request upload URL",
        });
        return;
      }

      // Abort any prior in-flight upload before starting this one (retry
      // path). Tracked via xhrRef so the cleanup is reachable from the
      // outer callback.
      xhrRef.current?.abort();

      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      xhr.timeout = UPLOAD_TIMEOUT_MS;

      const putPromise = new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener("progress", (e) => {
          if (!e.lengthComputable) return;
          setPhase({ phase: "uploading", progress: e.loaded / e.total });
        });
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`MinIO PUT failed: ${xhr.status}`));
          }
        });
        xhr.addEventListener("error", () => reject(new Error("Upload network error")));
        xhr.addEventListener("timeout", () => reject(new Error("Upload timed out")));
        xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));
        xhr.open("PUT", urlResp.upload_url);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.send(file);
      });

      try {
        await putPromise;
      } catch (err) {
        // An aborted upload was superseded by a retry — surface nothing
        // (the retry's own state will drive the UI).
        const msg = err instanceof Error ? err.message : String(err);
        if (msg !== "Upload aborted") {
          setPhase({ phase: "error", message: msg });
        }
        return;
      } finally {
        if (xhrRef.current === xhr) {
          xhrRef.current = null;
        }
      }

      try {
        await confirmUpload({
          lineup_id: lineupId,
          pane,
          kind,
          object_key: urlResp.object_key,
        }).unwrap();
      } catch (err) {
        setPhase({
          phase: "error",
          message: extractError(err) ?? "Could not confirm upload",
        });
        return;
      }

      // Confirm succeeded → RTK Query invalidation re-fetches the lineup,
      // pane re-renders with the new asset, no separate success state.
      setPhase({ phase: "idle" });
    },
    [requestUrl, confirmUpload],
  );

  const reset = useCallback(() => {
    xhrRef.current?.abort();
    setPhase({ phase: "idle" });
  }, []);

  return { phase, upload, reset };
}

function extractError(err: unknown): string | null {
  if (typeof err !== "object" || err === null) return null;
  const maybe = err as { data?: { detail?: unknown }; status?: number };
  const detail = maybe.data?.detail;
  if (typeof detail === "string") return detail;
  return null;
}
