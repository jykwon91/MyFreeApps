/**
 * LiveCs2SetupStatus — status card on the CS2 setup page.
 *
 * Shows:
 *   - Receiver running / not running
 *   - Port the receiver is bound to
 *   - Number of payloads CS2 has posted since receiver start
 *   - Last payload timestamp (relative)
 *   - Whether the auth token is initialized (a tripwire — should never be
 *     false in normal operation, but if it is we can surface a clear hint)
 *
 * Status block is the FIRST visual on the setup page so the operator can
 * tell at a glance whether things are working before reading the rest.
 */
import { Card } from "@platform/ui";
import { Antenna, Plug, Send, Shield } from "lucide-react";
import { formatLastEventTime } from "@/components/live/liveTopBarUtils";
import type { GsiServerStatus } from "@/types/desktop";

interface LiveCs2SetupStatusProps {
  ready: boolean;
  status: GsiServerStatus | null;
}

export default function LiveCs2SetupStatus({ ready, status }: LiveCs2SetupStatusProps) {
  return (
    <Card title="Status">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <Row
          icon={<Plug className="w-4 h-4" aria-hidden />}
          label="Receiver"
          value={
            !ready ? (
              <span className="text-muted-foreground">Initializing…</span>
            ) : status?.running ? (
              <span className="text-green-600 dark:text-green-400">Running on :{status.port}</span>
            ) : (
              <span className="text-destructive">Not running</span>
            )
          }
        />
        <Row
          icon={<Send className="w-4 h-4" aria-hidden />}
          label="Payloads received"
          value={<span>{status?.payloads_received ?? 0}</span>}
        />
        <Row
          icon={<Antenna className="w-4 h-4" aria-hidden />}
          label="Last payload"
          value={
            status?.last_event_at ? (
              <span>{formatLastEventTime(status.last_event_at)}</span>
            ) : (
              <span className="text-muted-foreground">Never</span>
            )
          }
        />
        <Row
          icon={<Shield className="w-4 h-4" aria-hidden />}
          label="Auth token"
          value={
            status?.auth_token_loaded ? (
              <span className="text-green-600 dark:text-green-400">Initialized</span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400">
                Not persisted — config may need re-installing on next launch
              </span>
            )
          }
        />
      </dl>
    </Card>
  );
}

interface RowProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}

function Row({ icon, label, value }: RowProps) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <div className="flex flex-col">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="text-sm font-medium">{value}</dd>
      </div>
    </div>
  );
}
