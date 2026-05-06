/**
 * Marketing-style header used on every invite-flow surface (registration
 * form, login form, expired card, etc.) so the recipient always sees
 * the same context.
 */
export default function InviteHeader() {
  return (
    <div className="mb-6">
      <p className="text-sm text-muted-foreground mb-1">
        You've been invited to join
      </p>
      <h1 className="text-2xl font-semibold">MyJobHunter</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Your AI-powered job search assistant.
      </p>
    </div>
  );
}
