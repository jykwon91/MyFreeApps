import type { ReactNode } from "react";
import { Briefcase } from "lucide-react";

export interface InvitePanelProps {
  children: ReactNode;
}

/**
 * Visual chrome shared by every state in the public invite flow
 * (loading, error, expired, accepting, registration form, success).
 *
 * Centring + brand mark + card padding live here so the body components
 * stay focused on their state-specific content.
 */
export default function InvitePanel({ children }: InvitePanelProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 px-4">
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
          <Briefcase className="w-6 h-6 text-primary-foreground" aria-hidden />
        </div>
        <span className="text-xl font-semibold tracking-tight">MyJobHunter</span>
      </div>
      <div className="w-full max-w-sm bg-background border rounded-xl p-8 shadow-xs">
        {children}
      </div>
      <p className="mt-8 text-xs text-muted-foreground">&copy; 2026 MyJobHunter</p>
    </div>
  );
}
