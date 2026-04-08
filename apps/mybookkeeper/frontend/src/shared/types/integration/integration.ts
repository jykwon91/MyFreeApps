export interface Integration {
  provider: string;
  connected: boolean;
  last_synced_at: string | null;
  metadata: Record<string, unknown> | null;
}
