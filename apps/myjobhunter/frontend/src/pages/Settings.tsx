import { Link } from "react-router-dom";
import { Badge, Button, Card } from "@platform/ui";

export default function Settings() {
  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account and integrations.
        </p>
      </div>

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

      {/* Security & Data — link to dedicated page */}
      <Card title="Security &amp; Data">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 space-y-1">
            <p className="text-sm text-muted-foreground">
              Export your data or permanently delete your account.
            </p>
          </div>
          <div className="shrink-0">
            <Link
              to="/security"
              className="inline-flex items-center justify-center rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors min-h-[44px] sm:min-h-[36px]"
              aria-label="Manage security and data"
            >
              Manage
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
