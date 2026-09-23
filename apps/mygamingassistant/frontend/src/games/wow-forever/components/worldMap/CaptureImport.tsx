import { useState, type ChangeEvent } from "react";
import { AlertBox, LoadingButton } from "@platform/ui";
import { useImportMapCapturesMutation } from "@/games/wow-forever/api/wowMapCapturesApi";
import type { WorldMapData } from "@/games/wow-forever/types/worldMap";
import type { MapCaptureImportResult } from "@/games/wow-forever/types/mapCapture";
import {
  CaptureFileError,
  readCaptureFile,
  type CaptureFileResult,
} from "@/games/wow-forever/worldMap/capture/readCaptureFile";

interface CaptureImportProps {
  data: WorldMapData;
}

interface Outcome {
  read: CaptureFileResult;
  saved: MapCaptureImportResult;
}

function skippedText(read: CaptureFileResult): string {
  const parts = Object.entries(read.skipped).map(([reason, count]) => `${count} ${reason}`);
  return parts.length ? ` Skipped: ${parts.join("; ")}.` : "";
}

/**
 * Operator-only: upload or paste the addon's SavedVariables file. It's read
 * in the browser; only the recognised places are sent to the server.
 */
export default function CaptureImport({ data }: CaptureImportProps) {
  const [fileText, setFileText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [importCaptures, { isLoading }] = useImportMapCapturesMutation();

  async function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) setFileText(await file.text());
  }

  async function submit() {
    setError(null);
    setOutcome(null);
    let read: CaptureFileResult;
    try {
      read = readCaptureFile(fileText, (id) => data.zoneById.has(id));
    } catch (e) {
      setError(e instanceof CaptureFileError ? e.message : "That file couldn't be read.");
      return;
    }
    if (read.captures.length === 0) {
      setError(`Nothing new to import.${skippedText(read)}`);
      return;
    }
    try {
      const saved = await importCaptures(read.captures).unwrap();
      setOutcome({ read, saved });
    } catch {
      setError("The import didn't go through — try again.");
    }
  }

  return (
    <section aria-labelledby="wm-import" className="rounded-xl border bg-card p-4 space-y-3 text-sm">
      <h2 id="wm-import" className="text-lg font-semibold">
        Import what the addon saw
      </h2>
      <p className="text-muted-foreground">
        After playing with MGA Companion, type <code>/reload</code>, then pick{" "}
        <code>WTF\Account\&lt;account&gt;\SavedVariables\MGACompanion.lua</code> from your WoW Forever folder (or paste its text).
        Re-importing the same file is safe. Run <code>python -m app.cli export-wow-captures</code> and commit the pack to publish.
      </p>
      <label className="block space-y-1">
        <span className="font-medium">SavedVariables file</span>
        <input type="file" accept=".lua,text/plain" onChange={(e) => void pickFile(e)} className="block min-h-[44px]" />
      </label>
      <label className="block space-y-1">
        <span className="font-medium">…or paste its text</span>
        <textarea
          value={fileText}
          onChange={(e) => setFileText(e.target.value)}
          rows={4}
          className="w-full rounded-md border bg-background p-2 font-mono text-xs"
        />
      </label>
      <LoadingButton isLoading={isLoading} loadingText="Importing…" onClick={() => void submit()} disabled={!fileText.trim()}>
        Import captures
      </LoadingButton>
      {error && <AlertBox variant="error">{error}</AlertBox>}
      {outcome && (
        <AlertBox variant="success">
          Imported {outcome.read.captures.length} place(s): {outcome.saved.created} new, {outcome.saved.updated} updated,{" "}
          {outcome.saved.unchanged} already up to date.{skippedText(outcome.read)}
        </AlertBox>
      )}
    </section>
  );
}
