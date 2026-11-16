import type { CenteredCardProps } from "../../types/centered-card-props";

/**
 * A single centered card on a muted full-height background, for a signed-out
 * page's one-message state ("Check your inbox", "Password reset", a dead link).
 */
export default function CenteredCard({ title, children }: CenteredCardProps) {
  return (
    <div className="min-h-screen flex flex-col bg-muted">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-card border rounded-lg p-8 w-full max-w-sm shadow-sm text-center">
          <h1 className="text-2xl font-semibold mb-4">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}
