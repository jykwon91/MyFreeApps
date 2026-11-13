/** What a confirmed removal does beyond saying how it went. */
export interface RemovalOptions {
  /** Runs once it's gone, whether just removed or already gone; a screen showing only this thing leaves. */
  onRemoved?: () => void;
  /** The server's reason when it refuses the removal, or null when the failure isn't a refusal. */
  refusalMessage?: (error: unknown) => string | null;
  /** Runs after a refusal, such as to reload what the refusal is about. */
  onRefused?: () => void;
}
