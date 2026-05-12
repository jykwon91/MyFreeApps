import { Link } from "react-router-dom";
import { Shield, ChevronRight } from "lucide-react";
import { Card } from "@platform/ui";

export default function Settings() {
  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account preferences.
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

      {/* Account section placeholder */}
      <Card title="Account">
        <p className="text-sm text-muted-foreground">
          Account management options coming in a future phase.
        </p>
      </Card>
    </main>
  );
}
