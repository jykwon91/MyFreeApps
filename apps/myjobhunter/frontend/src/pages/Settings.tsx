import { Link } from "react-router-dom";
import { Shield, ChevronRight } from "lucide-react";
import { Badge, Button, Card } from "@platform/ui";

export default function Settings() {
  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account and integrations.
        </p>
      </div>

      {/* Security — link out to dedicated page */}
      <Card title="Security">
        <Link
          to="/security"
          className="flex items-center justify-between gap-4 -m-2 p-2 rounded hover:bg-muted/40 transition-colors min-h-[44px]"
        >
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-sm font-medium">Two-factor authentication</p>
              <p className="text-xs text-muted-foreground">
                Protect your account with an authenticator app.
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </Link>
      </Card>

      {/* Gmail integration — disconnected state */}
      <Card title="Gmail Integration">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Gmail</span>
              <Badge label="Disconnected" color="gray" />
            </div>
            <p className="text-sm text-muted-foreground">
              Connect your Gmail so I can pull in job-related emails automatically.
            </p>
          </div>
          <div className="shrink-0">
            <Button
              variant="secondary"
              disabled
              title="Gmail integration coming in Phase 6"
              aria-label="Connect Gmail (coming in Phase 6)"
            >
              Connect Gmail
            </Button>
          </div>
        </div>
      </Card>

      {/* Account section placeholder */}
      <Card title="Account">
        <p className="text-sm text-muted-foreground">
          Account management options coming in a future phase.
        </p>
      </Card>
    </main>
  );
}
